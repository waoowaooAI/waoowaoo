'use client'

import { useEffect, useRef } from 'react'
import type { VoiceLine } from './types'

interface UseVoiceRuntimeSyncParams {
  loadData: () => Promise<void>
  voiceLines: VoiceLine[]
  activeVoiceTaskLineIds: Set<string>
  submittingVoiceLineIds: Set<string>
  setSubmittingVoiceLineIds: React.Dispatch<React.SetStateAction<Set<string>>>
}

export function useVoiceRuntimeSync({
  loadData,
  voiceLines,
  activeVoiceTaskLineIds,
  submittingVoiceLineIds,
  setSubmittingVoiceLineIds,
}: UseVoiceRuntimeSyncParams) {
  const hadActiveVoiceTasksRef = useRef(false)

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (submittingVoiceLineIds.size === 0) return
    setSubmittingVoiceLineIds((prev) => {
      const next = new Set(prev)
      for (const lineId of prev) {
        const line = voiceLines.find((item) => item.id === lineId)
        if (!line || line.audioUrl || activeVoiceTaskLineIds.has(lineId)) {
          next.delete(lineId)
        }
      }
      return next.size === prev.size ? prev : next
    })
  }, [activeVoiceTaskLineIds, setSubmittingVoiceLineIds, submittingVoiceLineIds.size, voiceLines])

  useEffect(() => {
    const hasActiveVoiceTasks =
      activeVoiceTaskLineIds.size > 0 || submittingVoiceLineIds.size > 0
    if (hasActiveVoiceTasks) {
      hadActiveVoiceTasksRef.current = true
      return
    }
    if (!hadActiveVoiceTasksRef.current) return
    hadActiveVoiceTasksRef.current = false
    void loadData()
  }, [activeVoiceTaskLineIds.size, loadData, submittingVoiceLineIds.size])
}
