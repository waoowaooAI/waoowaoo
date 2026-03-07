'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { logError as _ulogError } from '@/lib/logging/core'
import { useVoiceTaskPresentation } from '@/lib/query/hooks/useTaskPresentation'
import type { MatchedVoiceLine } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video'
import type { VoiceLine } from './types'
import { buildVoiceLineTargets } from './task-targets'

interface MatchedVoiceLinesQueryLike {
  data?: {
    voiceLines?: Array<{
      id: string
      lineIndex: number
      speaker: string
      content: string
      audioUrl: string | null
      audioDuration?: number | null
      matchedStoryboardId: string | null
      matchedPanelIndex: number | null
    }>
  }
  refetch: () => Promise<unknown>
}

interface UseVideoVoiceLinesParams {
  projectId: string
  matchedVoiceLinesQuery: MatchedVoiceLinesQueryLike
}

export function useVideoVoiceLines({
  projectId,
  matchedVoiceLinesQuery,
}: UseVideoVoiceLinesParams) {
  const [panelVoiceLines, setPanelVoiceLines] = useState<Map<string, MatchedVoiceLine[]>>(new Map())
  const [allVoiceLines, setAllVoiceLines] = useState<VoiceLine[]>([])

  useEffect(() => {
    const voiceLines = matchedVoiceLinesQuery.data?.voiceLines || []
    const panelMap = new Map<string, MatchedVoiceLine[]>()

    for (const voiceLine of voiceLines) {
      if (voiceLine.matchedStoryboardId && voiceLine.matchedPanelIndex !== null) {
        const panelKey = `${voiceLine.matchedStoryboardId}-${voiceLine.matchedPanelIndex}`
        const existing = panelMap.get(panelKey) || []
        existing.push({
          id: voiceLine.id,
          lineIndex: voiceLine.lineIndex,
          speaker: voiceLine.speaker,
          content: voiceLine.content,
          audioUrl: voiceLine.audioUrl || undefined,
          audioDuration: voiceLine.audioDuration || undefined,
        })
        panelMap.set(panelKey, existing)
      }
    }

    setPanelVoiceLines(panelMap)
    setAllVoiceLines(voiceLines as VoiceLine[])
  }, [matchedVoiceLinesQuery.data])

  const voiceLineTargets = useMemo(() => buildVoiceLineTargets(allVoiceLines), [allVoiceLines])
  const voiceLineStates = useVoiceTaskPresentation(projectId, voiceLineTargets, {
    enabled: !!projectId && voiceLineTargets.length > 0,
  })

  const runningVoiceLineIds = useMemo(() => {
    const ids = new Set<string>()
    for (const target of voiceLineTargets) {
      const state = voiceLineStates.getTaskState(target.key)
      if (state?.phase === 'queued' || state?.phase === 'processing') {
        ids.add(target.targetId)
      }
    }
    return ids
  }, [voiceLineStates, voiceLineTargets])

  const reloadVoiceLines = useCallback(async () => {
    try {
      await matchedVoiceLinesQuery.refetch()
    } catch (error) {
      _ulogError('Failed to reload voice lines:', error)
    }
  }, [matchedVoiceLinesQuery])

  return {
    panelVoiceLines,
    allVoiceLines,
    runningVoiceLineIds,
    reloadVoiceLines,
  }
}
