'use client'

import { useMemo } from 'react'
import { useVoiceTaskPresentation } from '@/lib/query/hooks/useTaskPresentation'
import { resolveTaskPresentationState, type TaskPresentationState } from '@/lib/task/presentation'
import type { VoiceLine } from './types'

interface UseVoiceTaskStateParams {
  projectId: string
  voiceLines: VoiceLine[]
  submittingVoiceLineIds: Set<string>
}

export function useVoiceTaskState({
  projectId,
  voiceLines,
  submittingVoiceLineIds,
}: UseVoiceTaskStateParams) {
  const voiceLineTargets = useMemo(() => {
    return voiceLines.map((line) => ({
      key: `line:${line.id}`,
      targetType: 'NovelPromotionVoiceLine',
      targetId: line.id,
      types: ['voice_line'],
      resource: 'audio' as const,
      hasOutput: !!line.audioUrl,
    }))
  }, [voiceLines])

  const voiceTaskStates = useVoiceTaskPresentation(projectId, voiceLineTargets, {
    enabled: !!projectId && voiceLineTargets.length > 0,
  })

  const voiceStatusStateByLineId = useMemo(() => {
    const map = new Map<string, TaskPresentationState>()
    for (const line of voiceLines) {
      const state = voiceTaskStates.getTaskState(`line:${line.id}`)
      if (!state) continue
      const presentation = resolveTaskPresentationState({
        phase: state.phase,
        intent: state.intent,
        resource: 'audio',
        hasOutput: !!line.audioUrl || !!state.hasOutputAtStart,
      })
      map.set(line.id, presentation)
    }
    return map
  }, [voiceLines, voiceTaskStates])

  const activeVoiceTaskLineIds = useMemo(() => {
    const ids = new Set<string>()
    for (const line of voiceLines) {
      const state = voiceTaskStates.getTaskState(`line:${line.id}`)
      if (!state) continue
      if (state.phase === 'queued' || state.phase === 'processing') {
        ids.add(line.id)
      }
    }
    return ids
  }, [voiceLines, voiceTaskStates])

  const runningLineIds = useMemo(() => {
    const ids = new Set<string>(submittingVoiceLineIds)
    for (const lineId of activeVoiceTaskLineIds) {
      ids.add(lineId)
    }
    return ids
  }, [activeVoiceTaskLineIds, submittingVoiceLineIds])

  return {
    voiceStatusStateByLineId,
    activeVoiceTaskLineIds,
    runningLineIds,
  }
}
