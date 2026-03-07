'use client'

import { useEffect, useRef } from 'react'
import { apiFetch } from '@/lib/api-fetch'
import type {
  PendingVoiceGenerationMap,
  PendingVoiceGenerationState,
  PendingVoiceTaskStatus,
  VoiceLine,
} from './types'

interface UseVoiceRuntimeSyncParams {
  loadData: () => Promise<void>
  voiceLines: VoiceLine[]
  activeVoiceTaskLineIds: Set<string>
  pendingVoiceGenerationByLineId: PendingVoiceGenerationMap
  setPendingVoiceGenerationByLineId: React.Dispatch<React.SetStateAction<PendingVoiceGenerationMap>>
  onTaskFailure?: (params: {
    lineId: string
    line: VoiceLine | null
    taskId: string | null
    errorMessage: string | null
  }) => void
}

const TASK_STATUS_POLL_INTERVAL_MS = 1200
const PENDING_RESULT_POLL_INTERVAL_MS = 1500

function resolvePendingBaseline(pending: PendingVoiceGenerationState) {
  const startedTs = Date.parse(pending.startedAt)
  const submittedTs = pending.submittedUpdatedAt ? Date.parse(pending.submittedUpdatedAt) : Number.NaN
  if (Number.isNaN(startedTs) && Number.isNaN(submittedTs)) return null
  if (Number.isNaN(startedTs)) return pending.submittedUpdatedAt
  if (Number.isNaN(submittedTs)) return pending.startedAt
  return new Date(Math.max(startedTs, submittedTs)).toISOString()
}

function hasLineGenerationSettled(line: VoiceLine | undefined, pending: PendingVoiceGenerationState) {
  if (!line) return true
  const baseline = resolvePendingBaseline(pending)
  const latestUpdatedAt = typeof line.updatedAt === 'string' ? line.updatedAt : null
  if (!latestUpdatedAt) {
    return baseline === null && !!line.audioUrl
  }
  if (!baseline) return true
  const latestTs = Date.parse(latestUpdatedAt)
  const baselineTs = Date.parse(baseline)
  if (Number.isNaN(latestTs) || Number.isNaN(baselineTs)) {
    return latestUpdatedAt !== baseline
  }
  return latestTs > baselineTs
}

async function fetchTaskStatus(taskId: string): Promise<{
  status: PendingVoiceTaskStatus
  errorMessage: string | null
}> {
  const response = await apiFetch(`/api/tasks/${taskId}`, {
    method: 'GET',
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(`task status fetch failed: ${taskId}`)
  }
  const payload = (await response.json()) as {
    task?: { status?: PendingVoiceTaskStatus | null; errorMessage?: string | null; error?: { message?: string | null } | null } | null
  }
  const status = payload.task?.status
  const errorMessage =
    typeof payload.task?.error?.message === 'string'
      ? payload.task.error.message
      : typeof payload.task?.errorMessage === 'string'
        ? payload.task.errorMessage
        : null
  if (status === 'queued' || status === 'processing' || status === 'completed' || status === 'failed') {
    return { status, errorMessage }
  }
  return { status: null, errorMessage }
}

export function useVoiceRuntimeSync({
  loadData,
  voiceLines,
  activeVoiceTaskLineIds,
  pendingVoiceGenerationByLineId,
  setPendingVoiceGenerationByLineId,
  onTaskFailure,
}: UseVoiceRuntimeSyncParams) {
  const reportedFailedTaskIdsRef = useRef<Set<string>>(new Set())
  const pendingEntries = Object.entries(pendingVoiceGenerationByLineId)
  const pendingLineIds = pendingEntries.map(([lineId]) => lineId)
  const completedPendingEntries = pendingEntries.filter(([, pending]) => pending.taskStatus === 'completed')

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    for (const [lineId, pending] of pendingEntries) {
      if (pending.taskStatus !== 'failed') continue
      const failureKey = pending.taskId || lineId
      if (reportedFailedTaskIdsRef.current.has(failureKey)) continue
      reportedFailedTaskIdsRef.current.add(failureKey)
      const line = voiceLines.find((item) => item.id === lineId) || null
      onTaskFailure?.({
        lineId,
        line,
        taskId: pending.taskId,
        errorMessage: pending.taskErrorMessage,
      })
    }
  }, [onTaskFailure, pendingEntries, voiceLines])

  useEffect(() => {
    if (pendingLineIds.length === 0) return
    setPendingVoiceGenerationByLineId((prev) => {
      let changed = false
      const next: PendingVoiceGenerationMap = { ...prev }
      for (const [lineId, pending] of Object.entries(prev)) {
        const line = voiceLines.find((item) => item.id === lineId)
        const failed = pending.taskStatus === 'failed'
        const settled = pending.taskStatus === 'completed' && hasLineGenerationSettled(line, pending)
        if (failed || settled) {
          delete next[lineId]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [
    activeVoiceTaskLineIds,
    pendingLineIds.length,
    setPendingVoiceGenerationByLineId,
    voiceLines,
  ])

  useEffect(() => {
    const taskEntries = pendingEntries.filter(([, pending]) =>
      !!pending.taskId && pending.taskStatus !== 'completed' && pending.taskStatus !== 'failed',
    )
    if (taskEntries.length === 0) return
    let cancelled = false
    const pollTaskStatuses = async () => {
      await Promise.all(taskEntries.map(async ([lineId, pending]) => {
        if (!pending.taskId) return
        try {
          const taskSnapshot = await fetchTaskStatus(pending.taskId)
          if (cancelled) return
          setPendingVoiceGenerationByLineId((prev) => {
            const current = prev[lineId]
            if (
              !current ||
              current.taskId !== pending.taskId ||
              (
                current.taskStatus === taskSnapshot.status &&
                current.taskErrorMessage === taskSnapshot.errorMessage
              )
            ) {
              return prev
            }
            return {
              ...prev,
              [lineId]: {
                ...current,
                taskStatus: taskSnapshot.status,
                taskErrorMessage: taskSnapshot.errorMessage,
              },
            }
          })
        } catch (error) {
          void error
        }
      }))
    }
    void pollTaskStatuses()
    const timer = window.setInterval(() => {
      void pollTaskStatuses()
    }, TASK_STATUS_POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [activeVoiceTaskLineIds, pendingEntries, pendingVoiceGenerationByLineId, setPendingVoiceGenerationByLineId])

  useEffect(() => {
    if (completedPendingEntries.length === 0) return
    void loadData()
    const timer = window.setInterval(() => {
      void loadData()
    }, PENDING_RESULT_POLL_INTERVAL_MS)
    return () => {
      window.clearInterval(timer)
    }
  }, [completedPendingEntries, loadData, pendingVoiceGenerationByLineId])
}
