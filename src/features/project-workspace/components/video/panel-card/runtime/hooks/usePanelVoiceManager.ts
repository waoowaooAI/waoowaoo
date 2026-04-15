import { logError as _ulogError } from '@/lib/logging/core'
import { queryKeys } from '@/lib/query/keys'
import { useGenerateProjectVoice } from '@/lib/query/hooks'
import type { MatchedVoiceLinesData } from '@/lib/query/hooks/useVoiceLines'
import { isAsyncTaskResponse } from '@/lib/task/client'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MatchedVoiceLine } from '../../../types'
import { EMPTY_RUNNING_VOICE_LINE_IDS, getErrorMessage } from '../shared'

interface UsePanelVoiceManagerParams {
  projectId: string
  episodeId?: string
  matchedVoiceLines: MatchedVoiceLine[]
  runningVoiceLineIds?: Set<string>
  audioFailedMessage: string
}

export function usePanelVoiceManager({
  projectId,
  episodeId,
  matchedVoiceLines,
  runningVoiceLineIds = EMPTY_RUNNING_VOICE_LINE_IDS,
  audioFailedMessage,
}: UsePanelVoiceManagerParams) {
  const generateProjectVoiceMutation = useGenerateProjectVoice(projectId)
  const queryClient = useQueryClient()
  const [submittingAudioIds, setSubmittingAudioIds] = useState<Set<string>>(new Set())
  const [submittingVoiceAudioIds, setSubmittingVoiceAudioIds] = useState<Set<string>>(new Set())
  const [audioGenerateError, setAudioGenerateError] = useState<string | null>(null)
  const [playingVoiceLineId, setPlayingVoiceLineId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const localVoiceLines = matchedVoiceLines

  const activeVoiceAudioIds = useMemo(() => {
    const ids = new Set<string>()
    for (const line of localVoiceLines) {
      if (runningVoiceLineIds.has(line.id)) ids.add(line.id)
    }
    return ids
  }, [localVoiceLines, runningVoiceLineIds])

  useEffect(() => {
    if (submittingVoiceAudioIds.size === 0) return
    setSubmittingVoiceAudioIds((prev) => {
      const next = new Set(prev)
      for (const lineId of prev) {
        const line = localVoiceLines.find((item) => item.id === lineId)
        if (!line || line.audioUrl || activeVoiceAudioIds.has(lineId)) next.delete(lineId)
      }
      return next.size === prev.size ? prev : next
    })
  }, [activeVoiceAudioIds, localVoiceLines, submittingVoiceAudioIds.size])

  useEffect(() => {
    return () => {
      if (!audioRef.current) return
      audioRef.current.pause()
      audioRef.current = null
    }
  }, [])

  const isVoiceLineTaskRunning = useCallback((lineId: string) => {
    return submittingAudioIds.has(lineId) || submittingVoiceAudioIds.has(lineId) || activeVoiceAudioIds.has(lineId)
  }, [activeVoiceAudioIds, submittingAudioIds, submittingVoiceAudioIds])

  const handlePlayVoiceLine = useCallback((voiceLine: MatchedVoiceLine) => {
    if (!voiceLine.audioUrl) return
    if (playingVoiceLineId === voiceLine.id) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      setPlayingVoiceLineId(null)
      return
    }

    if (audioRef.current) audioRef.current.pause()
    const audio = new Audio(voiceLine.audioUrl)
    audioRef.current = audio
    setPlayingVoiceLineId(voiceLine.id)
    audio.onended = () => {
      setPlayingVoiceLineId(null)
      audioRef.current = null
    }
    audio.onerror = () => {
      setPlayingVoiceLineId(null)
      audioRef.current = null
    }
    audio.play().catch(() => {
      setPlayingVoiceLineId(null)
      audioRef.current = null
    })
  }, [playingVoiceLineId])

  const handleGenerateAudio = useCallback(async (voiceLine: MatchedVoiceLine) => {
    if (!episodeId) return
    setSubmittingAudioIds((prev) => new Set(prev).add(voiceLine.id))
    setSubmittingVoiceAudioIds((prev) => new Set(prev).add(voiceLine.id))
    setAudioGenerateError(null)
    let handoffToTaskState = false

    try {
      const data = await generateProjectVoiceMutation.mutateAsync({
        episodeId,
        lineId: voiceLine.id,
      })

      if (isAsyncTaskResponse(data)) {
        handoffToTaskState = true
        return
      }

      const payload = data as { success?: boolean; results?: Array<{ audioUrl?: string }> }
      if (payload.results?.[0]?.audioUrl) {
        queryClient.setQueryData<MatchedVoiceLinesData>(
          queryKeys.voiceLines.matched(projectId, episodeId),
          (previous) => {
            if (!previous) return previous
            return {
              ...previous,
              voiceLines: previous.voiceLines.map((line) => (
                line.id === voiceLine.id ? { ...line, audioUrl: payload.results![0].audioUrl ?? null } : line
              )),
            }
          },
        )
      } else if (payload.success === false) {
        throw new Error(audioFailedMessage)
      }
    } catch (error: unknown) {
      _ulogError('Generate audio error:', error)
      setAudioGenerateError(getErrorMessage(error) || audioFailedMessage)
    } finally {
      setSubmittingAudioIds((prev) => {
        const next = new Set(prev)
        next.delete(voiceLine.id)
        return next
      })
      if (handoffToTaskState) return
      setSubmittingVoiceAudioIds((prev) => {
        const next = new Set(prev)
        next.delete(voiceLine.id)
        return next
      })
    }
  }, [audioFailedMessage, episodeId, generateProjectVoiceMutation, projectId, queryClient])

  const hasMatchedVoiceLines = localVoiceLines.length > 0
  const hasMatchedAudio = localVoiceLines.some((line) => line.audioUrl)

  return {
    localVoiceLines,
    audioGenerateError,
    playingVoiceLineId,
    isVoiceLineTaskRunning,
    handlePlayVoiceLine,
    handleGenerateAudio,
    hasMatchedVoiceLines,
    hasMatchedAudio,
  }
}
