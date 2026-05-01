'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { logInfo as _ulogInfo } from '@/lib/logging/core'
import {
  useAnalyzeProjectAssets,
  useScriptToStoryboardRunStream,
  useStoryToScriptRunStream,
} from '@/lib/query/hooks'
import { emitWorkspaceAssistantWorkflowEvent } from '../components/workspace-assistant/workspace-assistant-events'

interface UseWorkspaceExecutionParams {
  projectId: string
  episodeId?: string
  analysisModel?: string | null
  novelText: string
  t: (key: string) => string
  onRefresh: (options?: { scope?: string; mode?: string }) => Promise<void>
  onOpenAssetLibrary: (focusCharacterId?: string | null, refreshAssets?: boolean) => void
}

function isAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return err.name === 'AbortError' || err.message === 'Failed to fetch'
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

function isRunStreamTimeoutMessage(message: string): boolean {
  return /(?:run|task)\s+stream\s+timeout/i.test(message.trim())
}

export function useWorkspaceExecution({
  projectId,
  episodeId,
  analysisModel,
  novelText,
  t,
  onRefresh,
  onOpenAssetLibrary,
}: UseWorkspaceExecutionParams) {
  const analyzeProjectAssetsMutation = useAnalyzeProjectAssets(projectId)

  const [isSubmittingTTS] = useState(false)
  const [isAssetAnalysisRunning, setIsAssetAnalysisRunning] = useState(false)
  const [isConfirmingAssets, setIsConfirmingAssets] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [transitionProgress, setTransitionProgress] = useState({ message: '', step: '' })

  const storyToScriptStream = useStoryToScriptRunStream({ projectId, episodeId })
  const scriptToStoryboardStream = useScriptToStoryboardRunStream({ projectId, episodeId })
  const handledStoryToScriptRunIdsRef = useRef<Set<string>>(new Set())
  const handledScriptToStoryboardRunIdsRef = useRef<Set<string>>(new Set())
  const announcedStoryToScriptRunIdsRef = useRef<Set<string>>(new Set())
  const announcedScriptToStoryboardRunIdsRef = useRef<Set<string>>(new Set())
  const storyToScriptWasActiveRef = useRef(false)
  const scriptToStoryboardWasActiveRef = useRef(false)

  const finalizeStoryToScriptSuccess = useCallback(async (runId: string) => {
    const normalizedRunId = runId.trim()
    if (!normalizedRunId) return
    if (handledStoryToScriptRunIdsRef.current.has(normalizedRunId)) return
    handledStoryToScriptRunIdsRef.current.add(normalizedRunId)

    try {
      await onRefresh()
    } catch (refreshError) {
      _ulogInfo('[WorkspaceExecution] refresh after story-to-script completed failed', {
        runId: normalizedRunId,
        message: getErrorMessage(refreshError),
      })
    }

    emitWorkspaceAssistantWorkflowEvent({
      status: 'completed',
      workflowId: 'story-to-script',
      runId: normalizedRunId,
    })
    onOpenAssetLibrary()
    storyToScriptStream.reset()
  }, [onOpenAssetLibrary, onRefresh, storyToScriptStream])

  const finalizeScriptToStoryboardSuccess = useCallback(async (runId: string) => {
    const normalizedRunId = runId.trim()
    if (!normalizedRunId) return
    if (handledScriptToStoryboardRunIdsRef.current.has(normalizedRunId)) return
    handledScriptToStoryboardRunIdsRef.current.add(normalizedRunId)

    try {
      await onRefresh()
    } catch (refreshError) {
      _ulogInfo('[WorkspaceExecution] refresh after script-to-storyboard completed failed', {
        runId: normalizedRunId,
        message: getErrorMessage(refreshError),
      })
    }

    emitWorkspaceAssistantWorkflowEvent({
      status: 'completed',
      workflowId: 'script-to-storyboard',
      runId: normalizedRunId,
    })
    scriptToStoryboardStream.reset()
  }, [onRefresh, scriptToStoryboardStream])

  const handleGenerateTTS = useCallback(async () => {
    _ulogInfo('[ProjectWorkspace] TTS is disabled, skip generate request')
  }, [])

  const handleAnalyzeAssets = useCallback(async () => {
    if (!episodeId) return
    if (isAssetAnalysisRunning) {
      _ulogInfo('[WorkspaceExecution] asset analysis already running, skip duplicate trigger')
      return
    }

    try {
      setIsAssetAnalysisRunning(true)
      await analyzeProjectAssetsMutation.mutateAsync({ episodeId })
      await onRefresh({ scope: 'assets' })
    } catch (err: unknown) {
      if (isAbortError(err)) {
        _ulogInfo(t('execution.requestAborted'))
        return
      }
      alert(`${t('execution.analysisFailed')}: ${getErrorMessage(err)}`)
    } finally {
      setIsAssetAnalysisRunning(false)
    }
  }, [analyzeProjectAssetsMutation, episodeId, isAssetAnalysisRunning, onRefresh, t])

  const runStoryToScriptFlow = useCallback(async () => {
    if (!episodeId) {
      alert(t('execution.selectEpisode'))
      return
    }

    const storyContent = (novelText || '').trim()
    if (!storyContent) {
      alert(`${t('execution.prepareFailed')}: ${t('execution.fillContentFirst')}`)
      return
    }

    try {
      setIsTransitioning(true)
      setTransitionProgress({ message: t('execution.storyToScriptRunning'), step: 'streaming' })
      const runResult = await storyToScriptStream.run({
        episodeId,
        content: storyContent,
        model: analysisModel || undefined,
        temperature: 0.7,
        reasoning: true,
      })
      if (runResult.status !== 'completed') {
        throw new Error(runResult.errorMessage || t('execution.storyToScriptFailed'))
      }
      await finalizeStoryToScriptSuccess(runResult.runId || '')
    } catch (err: unknown) {
      if (isAbortError(err) || (err instanceof Error && err.message === 'aborted')) {
        _ulogInfo(t('execution.requestAborted'))
        return
      }
      const rawMessage = getErrorMessage(err)
      const friendlyMessage = isRunStreamTimeoutMessage(rawMessage)
        ? t('execution.taskStreamTimeout')
        : rawMessage
      emitWorkspaceAssistantWorkflowEvent({
        status: 'failed',
        workflowId: 'story-to-script',
        errorMessage: friendlyMessage,
      })
      alert(`${t('execution.prepareFailed')}: ${friendlyMessage}`)
    } finally {
      setIsTransitioning(false)
      setTransitionProgress({ message: '', step: '' })
    }
  }, [analysisModel, episodeId, finalizeStoryToScriptSuccess, novelText, storyToScriptStream, t])

  const runScriptToStoryboardFlow = useCallback(async () => {
    if (!episodeId) {
      alert(t('execution.selectEpisode'))
      return
    }

    try {
      setIsConfirmingAssets(true)
      setTransitionProgress({ message: t('execution.scriptToStoryboardRunning'), step: 'streaming' })
      const runResult = await scriptToStoryboardStream.run({
        episodeId,
        model: analysisModel || undefined,
        temperature: 0.7,
        reasoning: true,
      })
      if (runResult.status !== 'completed') {
        throw new Error(runResult.errorMessage || t('execution.scriptToStoryboardFailed'))
      }
      await finalizeScriptToStoryboardSuccess(runResult.runId || '')
    } catch (err: unknown) {
      if (isAbortError(err)) {
        _ulogInfo(t('execution.requestAborted'))
        return
      }
      const rawMessage = getErrorMessage(err)
      const friendlyMessage = isRunStreamTimeoutMessage(rawMessage)
        ? t('execution.taskStreamTimeout')
        : rawMessage
      emitWorkspaceAssistantWorkflowEvent({
        status: 'failed',
        workflowId: 'script-to-storyboard',
        errorMessage: friendlyMessage,
      })
      alert(`${t('execution.generationFailed')}: ${friendlyMessage}`)
    } finally {
      setIsConfirmingAssets(false)
      setTransitionProgress({ message: '', step: '' })
    }
  }, [analysisModel, episodeId, finalizeScriptToStoryboardSuccess, scriptToStoryboardStream, t])

  useEffect(() => {
    const active = (
      storyToScriptStream.isRunning ||
      storyToScriptStream.isRecoveredRunning ||
      storyToScriptStream.status === 'running'
    )
    if (active) {
      const runId = storyToScriptStream.runId.trim()
      if (runId && !announcedStoryToScriptRunIdsRef.current.has(runId)) {
        announcedStoryToScriptRunIdsRef.current.add(runId)
        emitWorkspaceAssistantWorkflowEvent({
          status: 'started',
          workflowId: 'story-to-script',
          runId,
        })
      }
      storyToScriptWasActiveRef.current = true
      return
    }
    if (storyToScriptStream.status === 'completed' && storyToScriptWasActiveRef.current) {
      storyToScriptWasActiveRef.current = false
      if (storyToScriptStream.runId) {
        void finalizeStoryToScriptSuccess(storyToScriptStream.runId)
      }
      return
    }
    if (storyToScriptStream.status === 'completed' && storyToScriptStream.runId) {
      void finalizeStoryToScriptSuccess(storyToScriptStream.runId)
      return
    }
    if (storyToScriptStream.status === 'failed' || storyToScriptStream.status === 'idle') {
      storyToScriptWasActiveRef.current = false
    }
  }, [
    finalizeStoryToScriptSuccess,
    storyToScriptStream.runId,
    storyToScriptStream.isRecoveredRunning,
    storyToScriptStream.isRunning,
    storyToScriptStream.status,
  ])

  useEffect(() => {
    const active = (
      scriptToStoryboardStream.isRunning ||
      scriptToStoryboardStream.isRecoveredRunning ||
      scriptToStoryboardStream.status === 'running'
    )
    if (active) {
      const runId = scriptToStoryboardStream.runId.trim()
      if (runId && !announcedScriptToStoryboardRunIdsRef.current.has(runId)) {
        announcedScriptToStoryboardRunIdsRef.current.add(runId)
        emitWorkspaceAssistantWorkflowEvent({
          status: 'started',
          workflowId: 'script-to-storyboard',
          runId,
        })
      }
      scriptToStoryboardWasActiveRef.current = true
      return
    }
    if (scriptToStoryboardStream.status === 'completed' && scriptToStoryboardWasActiveRef.current) {
      scriptToStoryboardWasActiveRef.current = false
      if (scriptToStoryboardStream.runId) {
        void finalizeScriptToStoryboardSuccess(scriptToStoryboardStream.runId)
      }
      return
    }
    if (scriptToStoryboardStream.status === 'completed' && scriptToStoryboardStream.runId) {
      void finalizeScriptToStoryboardSuccess(scriptToStoryboardStream.runId)
      return
    }
    if (scriptToStoryboardStream.status === 'failed' || scriptToStoryboardStream.status === 'idle') {
      scriptToStoryboardWasActiveRef.current = false
    }
  }, [
    finalizeScriptToStoryboardSuccess,
    scriptToStoryboardStream.runId,
    scriptToStoryboardStream.isRecoveredRunning,
    scriptToStoryboardStream.isRunning,
    scriptToStoryboardStream.status,
  ])

  const showCreatingToast = useMemo(() => (
    storyToScriptStream.isRunning ||
    storyToScriptStream.isRecoveredRunning ||
    scriptToStoryboardStream.isRunning ||
    scriptToStoryboardStream.isRecoveredRunning ||
    isTransitioning ||
    isConfirmingAssets
  ), [
    isConfirmingAssets,
    isTransitioning,
    scriptToStoryboardStream.isRecoveredRunning,
    scriptToStoryboardStream.isRunning,
    storyToScriptStream.isRecoveredRunning,
    storyToScriptStream.isRunning,
  ])

  return {
    isSubmittingTTS,
    isAssetAnalysisRunning,
    isConfirmingAssets,
    isTransitioning,
    transitionProgress,
    storyToScriptStream,
    scriptToStoryboardStream,
    handleGenerateTTS,
    handleAnalyzeAssets,
    runStoryToScriptFlow,
    runScriptToStoryboardFlow,
    showCreatingToast,
  }
}
