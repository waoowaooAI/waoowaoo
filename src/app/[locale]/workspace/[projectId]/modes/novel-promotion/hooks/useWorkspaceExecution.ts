'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { logInfo as _ulogInfo } from '@/lib/logging/core'
import {
  useAnalyzeProjectAssets,
  useScriptToStoryboardRunStream,
  useStoryToScriptRunStream,
} from '@/lib/query/hooks'

interface UseWorkspaceExecutionParams {
  projectId: string
  episodeId?: string
  currentStage: string
  analysisModel?: string | null
  novelText: string
  t: (key: string) => string
  onRefresh: (options?: { scope?: string; mode?: string }) => Promise<void>
  onUpdateConfig: (key: string, value: unknown) => Promise<void>
  onStageChange: (stage: string) => void
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

function readSessionBoolean(key: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeSessionBoolean(key: string, value: boolean) {
  if (typeof window === 'undefined') return
  try {
    if (value) {
      window.sessionStorage.setItem(key, '1')
      return
    }
    window.sessionStorage.removeItem(key)
  } catch {
    // ignore session storage failures
  }
}

export function useWorkspaceExecution({
  projectId,
  episodeId,
  currentStage,
  analysisModel,
  novelText,
  t,
  onRefresh,
  onUpdateConfig,
  onStageChange,
  onOpenAssetLibrary,
}: UseWorkspaceExecutionParams) {
  const analyzeProjectAssetsMutation = useAnalyzeProjectAssets(projectId)
  const storageScope = `${projectId}:${episodeId || 'global'}`
  const storyToScriptMinimizedStorageKey = `novel-promotion:story-to-script:minimized:${storageScope}`
  const scriptToStoryboardMinimizedStorageKey = `novel-promotion:script-to-storyboard:minimized:${storageScope}`

  const [isSubmittingTTS] = useState(false)
  const [isAssetAnalysisRunning, setIsAssetAnalysisRunning] = useState(false)
  const [isConfirmingAssets, setIsConfirmingAssets] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [transitionProgress, setTransitionProgress] = useState({ message: '', step: '' })
  const [storyToScriptConsoleMinimized, setStoryToScriptConsoleMinimized] = useState(
    () => readSessionBoolean(storyToScriptMinimizedStorageKey),
  )
  const [scriptToStoryboardConsoleMinimized, setScriptToStoryboardConsoleMinimized] = useState(
    () => readSessionBoolean(scriptToStoryboardMinimizedStorageKey),
  )

  const storyToScriptStream = useStoryToScriptRunStream({ projectId, episodeId })
  const scriptToStoryboardStream = useScriptToStoryboardRunStream({ projectId, episodeId })
  const handledStoryToScriptRunIdsRef = useRef<Set<string>>(new Set())
  const handledScriptToStoryboardRunIdsRef = useRef<Set<string>>(new Set())
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

    setStoryToScriptConsoleMinimized(true)
    onStageChange('script')
    onOpenAssetLibrary()
    storyToScriptStream.reset()
  }, [onOpenAssetLibrary, onRefresh, onStageChange, storyToScriptStream])

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

    setScriptToStoryboardConsoleMinimized(true)
    onStageChange('storyboard')
    scriptToStoryboardStream.reset()
  }, [onRefresh, onStageChange, scriptToStoryboardStream])

  useEffect(() => {
    setStoryToScriptConsoleMinimized(readSessionBoolean(storyToScriptMinimizedStorageKey))
  }, [storyToScriptMinimizedStorageKey])

  useEffect(() => {
    setScriptToStoryboardConsoleMinimized(readSessionBoolean(scriptToStoryboardMinimizedStorageKey))
  }, [scriptToStoryboardMinimizedStorageKey])

  useEffect(() => {
    writeSessionBoolean(storyToScriptMinimizedStorageKey, storyToScriptConsoleMinimized)
  }, [storyToScriptConsoleMinimized, storyToScriptMinimizedStorageKey])

  useEffect(() => {
    writeSessionBoolean(scriptToStoryboardMinimizedStorageKey, scriptToStoryboardConsoleMinimized)
  }, [scriptToStoryboardConsoleMinimized, scriptToStoryboardMinimizedStorageKey])

  const handleGenerateTTS = useCallback(async () => {
    _ulogInfo('[NovelPromotionWorkspace] TTS is disabled, skip generate request')
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
      setStoryToScriptConsoleMinimized(false)

      await onUpdateConfig('workflowMode', 'agent')
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
      alert(`${t('execution.prepareFailed')}: ${friendlyMessage}`)
    } finally {
      setIsTransitioning(false)
      setTransitionProgress({ message: '', step: '' })
    }
  }, [analysisModel, episodeId, finalizeStoryToScriptSuccess, novelText, onUpdateConfig, storyToScriptStream, t])

  const runScriptToStoryboardFlow = useCallback(async () => {
    if (!episodeId) {
      alert(t('execution.selectEpisode'))
      return
    }

    try {
      setScriptToStoryboardConsoleMinimized(false)
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
      alert(`${t('execution.generationFailed')}: ${isRunStreamTimeoutMessage(rawMessage) ? t('execution.taskStreamTimeout') : rawMessage}`)
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
    if (storyToScriptStream.status === 'completed' && currentStage === 'config' && storyToScriptStream.runId) {
      void finalizeStoryToScriptSuccess(storyToScriptStream.runId)
      return
    }
    if (storyToScriptStream.status === 'failed' || storyToScriptStream.status === 'idle') {
      storyToScriptWasActiveRef.current = false
    }
  }, [
    currentStage,
    finalizeStoryToScriptSuccess,
    storyToScriptStream.isRecoveredRunning,
    storyToScriptStream.isRunning,
    storyToScriptStream.runId,
    storyToScriptStream.status,
  ])

  useEffect(() => {
    const active = (
      scriptToStoryboardStream.isRunning ||
      scriptToStoryboardStream.isRecoveredRunning ||
      scriptToStoryboardStream.status === 'running'
    )
    if (active) {
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
    if (scriptToStoryboardStream.status === 'completed' && currentStage === 'script' && scriptToStoryboardStream.runId) {
      void finalizeScriptToStoryboardSuccess(scriptToStoryboardStream.runId)
      return
    }
    if (scriptToStoryboardStream.status === 'failed' || scriptToStoryboardStream.status === 'idle') {
      scriptToStoryboardWasActiveRef.current = false
    }
  }, [
    currentStage,
    finalizeScriptToStoryboardSuccess,
    scriptToStoryboardStream.isRecoveredRunning,
    scriptToStoryboardStream.isRunning,
    scriptToStoryboardStream.runId,
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
    storyToScriptConsoleMinimized,
    setStoryToScriptConsoleMinimized,
    scriptToStoryboardConsoleMinimized,
    setScriptToStoryboardConsoleMinimized,
    storyToScriptStream,
    scriptToStoryboardStream,
    handleGenerateTTS,
    handleAnalyzeAssets,
    runStoryToScriptFlow,
    runScriptToStoryboardFlow,
    showCreatingToast,
  }
}
