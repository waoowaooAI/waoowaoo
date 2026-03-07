'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { shouldShowError } from '@/lib/error-utils'
import { upsertTaskTargetOverlay } from '@/lib/query/task-target-overlay'
import { hasAnyVoiceBinding } from '@/lib/voice/provider-voice-binding'
import { getErrorMessage, getErrorStatus } from './utils'
import type {
  Character,
  PendingVoiceGenerationMap,
  PendingVoiceGenerationState,
  SpeakerVoiceEntry,
  VoiceLine,
} from './types'

interface MutationLike<TInput = unknown, TOutput = unknown> {
  mutateAsync: (input: TInput) => Promise<TOutput>
}

interface UseVoiceGenerationActionsParams {
  projectId: string
  episodeId: string
  t: (key: string) => string
  voiceLines: VoiceLine[]
  linesWithAudio: number
  speakerCharacterMap: Record<string, Character>
  speakerVoices: Record<string, SpeakerVoiceEntry>
  analyzeVoiceMutation: MutationLike<{ episodeId: string }>
  generateVoiceMutation: MutationLike<{ episodeId: string; lineId?: string; all?: boolean }, {
    success?: boolean
    error?: string
    async?: boolean
    taskId?: string
    taskIds?: string[]
    results?: Array<{ lineId?: string; taskId?: string; audioUrl?: string }>
  }>
  downloadVoicesMutation: MutationLike<{ episodeId: string }, Blob>
  loadData: () => Promise<void>
  notifyVoiceLinesChanged: () => void
  setPendingVoiceGenerationByLineId: React.Dispatch<React.SetStateAction<PendingVoiceGenerationMap>>
}

export function useVoiceGenerationActions({
  projectId,
  episodeId,
  t,
  voiceLines,
  linesWithAudio,
  speakerCharacterMap,
  speakerVoices,
  analyzeVoiceMutation,
  generateVoiceMutation,
  downloadVoicesMutation,
  loadData,
  notifyVoiceLinesChanged,
  setPendingVoiceGenerationByLineId,
}: UseVoiceGenerationActionsParams) {
  const queryClient = useQueryClient()
  const [analyzing, setAnalyzing] = useState(false)
  const [isBatchSubmittingAll, setIsBatchSubmittingAll] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  const buildPendingGenerationMap = useCallback((lineIds: string[]) => {
    const next: PendingVoiceGenerationMap = {}
    const startedAt = new Date().toISOString()
    for (const lineId of lineIds) {
      const line = voiceLines.find((item) => item.id === lineId)
      next[lineId] = {
        submittedUpdatedAt: line?.updatedAt ?? null,
        startedAt,
        taskId: null,
        taskStatus: null,
        taskErrorMessage: null,
      }
    }
    return next
  }, [voiceLines])

  const withTaskState = useCallback((
    prev: PendingVoiceGenerationMap,
    lineId: string,
    patch: Partial<PendingVoiceGenerationState>,
  ) => {
    const current = prev[lineId]
    if (!current) return prev
    return {
      ...prev,
      [lineId]: {
        ...current,
        ...patch,
      },
    }
  }, [])

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true)
    try {
      await analyzeVoiceMutation.mutateAsync({ episodeId })
      await loadData()
      notifyVoiceLinesChanged()
    } catch (error: unknown) {
      if (shouldShowError(error)) {
        alert(`${t('errors.analyzeFailed')}: ${getErrorMessage(error)}`)
      }
    } finally {
      setAnalyzing(false)
    }
  }, [analyzeVoiceMutation, episodeId, loadData, notifyVoiceLinesChanged, t])

  const handleGenerateLine = useCallback(async (lineId: string) => {
    const pendingGeneration = buildPendingGenerationMap([lineId])
    setPendingVoiceGenerationByLineId((prev) => ({
      ...prev,
      ...pendingGeneration,
    }))
    let handoffToTaskState = false

    try {
      const data = await generateVoiceMutation.mutateAsync({ episodeId, lineId })
      if (!data?.success) {
        throw new Error(data?.error || t('errors.generateFailed'))
      }
      if (data?.async && data?.taskId) {
        setPendingVoiceGenerationByLineId((prev) => withTaskState(prev, lineId, {
          taskId: data.taskId,
          taskStatus: 'queued',
        }))
        upsertTaskTargetOverlay(queryClient, {
          projectId,
          targetType: 'NovelPromotionVoiceLine',
          targetId: lineId,
          phase: 'queued',
          runningTaskId: data.taskId,
          runningTaskType: 'voice_line',
          intent: 'generate',
          hasOutputAtStart: false,
        })
        handoffToTaskState = true
      }
      notifyVoiceLinesChanged()
    } catch (error: unknown) {
      if (getErrorStatus(error) === 402) {
        alert(`${t('alerts.insufficientBalance')}\n\n${getErrorMessage(error) || t('alerts.insufficientBalanceMsg')}`)
        return
      }
      if (shouldShowError(error)) {
        alert(`${t('errors.generateFailed')}: ${getErrorMessage(error)}`)
      }
    } finally {
      if (handoffToTaskState) return
      setPendingVoiceGenerationByLineId((prev) => {
        if (!(lineId in prev)) return prev
        const next = { ...prev }
        delete next[lineId]
        return next
      })
    }
  }, [
    buildPendingGenerationMap,
    episodeId,
    generateVoiceMutation,
    notifyVoiceLinesChanged,
    projectId,
    queryClient,
    setPendingVoiceGenerationByLineId,
    t,
    withTaskState,
  ])

  const handleGenerateAll = useCallback(async () => {
    const linesToGenerate = voiceLines.filter((line) => {
      if (line.audioUrl) return false
      const character = speakerCharacterMap[line.speaker]
      const speakerVoice = speakerVoices[line.speaker]
      return hasAnyVoiceBinding({
        character,
        speakerVoice,
      })
    })

    if (linesToGenerate.length === 0) {
      alert(t('alerts.noLinesToGenerate'))
      return
    }

    setIsBatchSubmittingAll(true)
    const lineIds = linesToGenerate.map((line) => line.id)
    const pendingGeneration = buildPendingGenerationMap(lineIds)
    setPendingVoiceGenerationByLineId((prev) => ({
      ...prev,
      ...pendingGeneration,
    }))
    let handoffToTaskState = false

    try {
      const data = await generateVoiceMutation.mutateAsync({ episodeId, all: true })
      if (!Array.isArray(data.taskIds) || data.taskIds.length === 0) {
        setPendingVoiceGenerationByLineId((prev) => {
          const next = { ...prev }
          for (const lineId of lineIds) delete next[lineId]
          return next
        })
        alert(data?.error || t('alerts.noLinesToGenerate'))
        return
      }

      const taskResults = Array.isArray(data.results) ? data.results : []
      if (taskResults.length > 0) {
        for (const result of taskResults) {
          if (!result?.lineId || !result?.taskId) continue
          const resultLineId = result.lineId
          const resultTaskId = result.taskId
          setPendingVoiceGenerationByLineId((prev) => withTaskState(prev, resultLineId, {
            taskId: resultTaskId,
            taskStatus: 'queued',
          }))
          upsertTaskTargetOverlay(queryClient, {
            projectId,
            targetType: 'NovelPromotionVoiceLine',
            targetId: resultLineId,
            phase: 'queued',
            runningTaskId: resultTaskId,
            runningTaskType: 'voice_line',
            intent: 'generate',
            hasOutputAtStart: false,
          })
        }
      } else {
        for (let index = 0; index < lineIds.length && index < data.taskIds.length; index += 1) {
          const currentLineId = lineIds[index]
          const currentTaskId = data.taskIds[index]
          setPendingVoiceGenerationByLineId((prev) => withTaskState(prev, currentLineId, {
            taskId: currentTaskId,
            taskStatus: 'queued',
          }))
          upsertTaskTargetOverlay(queryClient, {
            projectId,
            targetType: 'NovelPromotionVoiceLine',
            targetId: currentLineId,
            phase: 'queued',
            runningTaskId: currentTaskId,
            runningTaskType: 'voice_line',
            intent: 'generate',
            hasOutputAtStart: false,
          })
        }
      }
      handoffToTaskState = true
      notifyVoiceLinesChanged()
    } catch (error: unknown) {
      if (getErrorStatus(error) === 402) {
        alert(`${t('alerts.insufficientBalance')}\n\n${getErrorMessage(error) || t('alerts.insufficientBalanceMsg')}`)
        return
      }
      if (shouldShowError(error)) {
        alert(`${t('errors.batchFailed')}: ${getErrorMessage(error)}`)
      }
    } finally {
      setIsBatchSubmittingAll(false)
      if (handoffToTaskState) return
      setPendingVoiceGenerationByLineId((prev) => {
        const next = { ...prev }
        for (const lineId of lineIds) delete next[lineId]
        return next
      })
    }
  }, [
    buildPendingGenerationMap,
    episodeId,
    generateVoiceMutation,
    notifyVoiceLinesChanged,
    projectId,
    queryClient,
    setPendingVoiceGenerationByLineId,
    speakerCharacterMap,
    speakerVoices,
    t,
    voiceLines,
    withTaskState,
  ])

  const handleDownloadAll = useCallback(async () => {
    if (linesWithAudio === 0) return

    setIsDownloading(true)
    try {
      const blob = await downloadVoicesMutation.mutateAsync({ episodeId })
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `配音_${new Date().toISOString().slice(0, 10)}.zip`
      document.body.appendChild(anchor)
      anchor.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(anchor)
    } catch (error: unknown) {
      if (shouldShowError(error)) {
        alert(`${t('errors.downloadFailed')}: ${getErrorMessage(error)}`)
      }
    } finally {
      setIsDownloading(false)
    }
  }, [downloadVoicesMutation, episodeId, linesWithAudio, t])

  return {
    analyzing,
    isBatchSubmittingAll,
    isDownloading,
    handleAnalyze,
    handleGenerateLine,
    handleGenerateAll,
    handleDownloadAll,
  }
}
