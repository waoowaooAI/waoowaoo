'use client'

import { useCallback, useRef, useState } from 'react'
import { logError as _ulogError } from '@/lib/logging/core'
import { useFetchProjectVoiceStageData } from '@/lib/query/hooks'
import type { SpeakerVoiceEntry, VoiceLine } from './types'

interface UseVoiceStageDataLoaderParams {
  projectId: string
  episodeId: string
}

interface VoiceStageDataPayload {
  voiceLines?: VoiceLine[]
  speakerVoices?: Record<string, SpeakerVoiceEntry>
  speakers?: string[]
}

export function useVoiceStageDataLoader({
  projectId,
  episodeId,
}: UseVoiceStageDataLoaderParams) {
  const fetchVoiceStageDataMutation = useFetchProjectVoiceStageData(projectId)
  const fetchVoiceStageDataRef = useRef(fetchVoiceStageDataMutation)
  fetchVoiceStageDataRef.current = fetchVoiceStageDataMutation

  const [voiceLines, setVoiceLines] = useState<VoiceLine[]>([])
  const [speakerVoices, setSpeakerVoices] = useState<Record<string, SpeakerVoiceEntry>>({})
  const [projectSpeakers, setProjectSpeakers] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchVoiceStageDataRef.current.mutateAsync({ episodeId })
      const payload = (data || {}) as VoiceStageDataPayload
      setVoiceLines(payload.voiceLines || [])
      setSpeakerVoices(payload.speakerVoices || {})
      setProjectSpeakers(payload.speakers || [])
    } catch (error) {
      _ulogError('Load data error:', error)
    } finally {
      setLoading(false)
    }
  }, [episodeId])

  return {
    voiceLines,
    setVoiceLines,
    speakerVoices,
    setSpeakerVoices,
    projectSpeakers,
    setProjectSpeakers,
    loading,
    loadData,
  }
}
