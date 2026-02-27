'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  RunStreamEvent,
} from '@/lib/novel-promotion/run-stream/types'
import { type SSEEvent } from '@/lib/task/types'
import {
  mapTaskSSEEventToRunEvents,
  toObject,
  toTerminalRunResult,
} from './event-parser'
import {
  applyRunStreamEvent,
} from './state-machine'
import {
  clearRunSnapshot,
  loadRunSnapshot,
  saveRunSnapshot,
} from './snapshot'
import { pollTaskTerminalState } from './task-terminal-poll'
import { subscribeRecoveredRun } from './recovered-run-subscription'
import { executeRunRequest } from './run-request-executor'
import { deriveRunStreamView } from './run-stream-view'
import type {
  RunResult,
  RunState,
  UseRunStreamStateOptions,
} from './types'

export type {
  RunResult,
  RunState,
  RunStepState,
  UseRunStreamStateOptions,
} from './types'

const TERMINAL_CLEANUP_MS = 15_000
const TASK_STREAM_TIMEOUT_MS = 1000 * 60 * 30

// Module-level guard: prevents repeated resolveActiveTaskId probes even if
// React unmounts / remounts the hook (e.g. StrictMode, HMR, layout shifts).
// Entries expire after 60 s so a genuine page navigation re-probes.
const PROBE_COOLDOWN_MS = 60_000
const probedScopes = new Map<string, number>()

export function useRunStreamState<TParams>(options: UseRunStreamStateOptions<TParams>) {
  const {
    projectId,
    endpoint,
    storageKeyPrefix,
    storageScopeKey,
    eventSourceMode = 'internal',
    acceptedTaskTypes,
    buildRequestBody,
    validateParams,
    resolveActiveTaskId,
  } = options
  const [runState, setRunState] = useState<RunState | null>(null)
  const runStateRef = useRef<RunState | null>(null)
  const [clock, setClock] = useState(() => Date.now())
  const [isLiveRunning, setIsLiveRunning] = useState(false)
  const [isRecoveredRunning, setIsRecoveredRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const finalResultRef = useRef<RunResult | null>(null)
  const hydratedStorageKeyRef = useRef<string | null>(null)
  const resolveActiveTaskIdRef = useRef(resolveActiveTaskId)
  const storageKey = useMemo(() => {
    if (storageScopeKey) {
      return `${storageKeyPrefix}:${projectId}:${storageScopeKey}`
    }
    return `${storageKeyPrefix}:${projectId}`
  }, [projectId, storageKeyPrefix, storageScopeKey])

  const applyEvent = useCallback((event: RunStreamEvent) => {
    setRunState((prev) => applyRunStreamEvent(prev, event))
  }, [])

  const applyAndCapture = useCallback((streamEvent: RunStreamEvent) => {
    if (!streamEvent.runId) return
    applyEvent(streamEvent)
    const terminalResult = toTerminalRunResult(streamEvent)
    if (terminalResult) {
      finalResultRef.current = terminalResult
    }
  }, [applyEvent])

  const ingestTaskEvent = useCallback((taskEvent: SSEEvent) => {
    if (!taskEvent || typeof taskEvent.taskId !== 'string' || !taskEvent.taskId) return
    if (
      Array.isArray(acceptedTaskTypes) &&
      acceptedTaskTypes.length > 0 &&
      (typeof taskEvent.taskType !== 'string' || !acceptedTaskTypes.includes(taskEvent.taskType))
    ) {
      return
    }

    const payload = toObject(taskEvent.payload)
    const eventEpisodeId =
      typeof taskEvent.episodeId === 'string'
        ? taskEvent.episodeId
        : typeof payload.episodeId === 'string'
          ? payload.episodeId
          : null
    const activeRun = runStateRef.current
    if (storageScopeKey && !eventEpisodeId && !activeRun?.runId) return
    if (storageScopeKey && eventEpisodeId && eventEpisodeId !== storageScopeKey) return

    if (
      activeRun &&
      activeRun.status === 'running' &&
      activeRun.runId &&
      taskEvent.taskId !== activeRun.runId
    ) {
      return
    }

    const runEvents = mapTaskSSEEventToRunEvents(taskEvent)
    for (const runEvent of runEvents) {
      applyAndCapture(runEvent)
    }
  }, [acceptedTaskTypes, applyAndCapture, storageScopeKey])

  useEffect(() => {
    runStateRef.current = runState
  }, [runState])

  useEffect(() => {
    resolveActiveTaskIdRef.current = resolveActiveTaskId
  }, [resolveActiveTaskId])

  const pollTaskTerminalStateFn = useCallback(async (taskId: string): Promise<RunResult | null> => {
    return await pollTaskTerminalState({ taskId, applyAndCapture })
  }, [applyAndCapture])

  useEffect(() => {
    if (!projectId) return
    if (hydratedStorageKeyRef.current === storageKey) return
    hydratedStorageKeyRef.current = storageKey
    const snapshotRunState = loadRunSnapshot(storageKey)
    if (!snapshotRunState) return
    setRunState(snapshotRunState)
    if (snapshotRunState.status === 'running') {
      setIsRecoveredRunning(true)
    }
  }, [projectId, storageKey])

  // Probe for active task only ONCE per storageKey (module-level guard).
  // After the initial probe, all updates come through SSE.
  useEffect(() => {
    if (!projectId || !resolveActiveTaskIdRef.current) return

    // Module-level guard: skip if probed recently
    const lastProbed = probedScopes.get(storageKey)
    if (lastProbed && Date.now() - lastProbed < PROBE_COOLDOWN_MS) return
    probedScopes.set(storageKey, Date.now())

    // If there's already state (e.g. from snapshot hydration), skip probe
    if (runStateRef.current) return
    const existingSnapshot = loadRunSnapshot(storageKey)
    if (existingSnapshot) return

    let cancelled = false
    void (async () => {
      const activeTaskId = await resolveActiveTaskIdRef.current?.({
        projectId,
        storageScopeKey,
      }).catch(() => null)
      if (cancelled || !activeTaskId) return
      const now = Date.now()
      setRunState((prev) => {
        if (prev) return prev
        return {
          runId: activeTaskId,
          status: 'running',
          startedAt: now,
          updatedAt: now,
          terminalAt: null,
          errorMessage: '',
          summary: null,
          payload: null,
          stepsById: {},
          stepOrder: [],
          activeStepId: null,
          selectedStepId: null,
        }
      })
      setIsRecoveredRunning(true)
    })()

    return () => {
      cancelled = true
    }
  }, [projectId, storageKey, storageScopeKey])

  useEffect(() => {
    if (!projectId || !isRecoveredRunning || isLiveRunning) return
    const taskId = runState?.runId || ''
    if (!taskId || runState?.status !== 'running') return

    return subscribeRecoveredRun({
      projectId,
      storageScopeKey,
      taskId,
      eventSourceMode,
      taskStreamTimeoutMs: TASK_STREAM_TIMEOUT_MS,
      applyAndCapture,
      pollTaskTerminalState: pollTaskTerminalStateFn,
      onSettled: () => {
        setIsRecoveredRunning(false)
      },
    })
  }, [
    applyAndCapture,
    eventSourceMode,
    isLiveRunning,
    isRecoveredRunning,
    pollTaskTerminalStateFn,
    projectId,
    runState?.runId,
    runState?.status,
    storageScopeKey,
  ])

  useEffect(() => {
    if (!isRecoveredRunning) return
    if (!runState) {
      setIsRecoveredRunning(false)
      return
    }
    if (runState.status === 'completed' || runState.status === 'failed') {
      setIsRecoveredRunning(false)
    }
  }, [isRecoveredRunning, runState, runState?.status])

  useEffect(() => {
    if (!projectId) return
    saveRunSnapshot(storageKey, runState)
  }, [projectId, runState, storageKey])

  const run = useCallback(
    async (params: TParams): Promise<RunResult> => {
      if (!projectId) {
        throw new Error('projectId is required')
      }
      validateParams?.(params)

      abortRef.current?.abort()
      setIsRecoveredRunning(false)
      setIsLiveRunning(true)
      const controller = new AbortController()
      abortRef.current = controller
      finalResultRef.current = null

      try {
        const requestBody = buildRequestBody(params)
        return await executeRunRequest({
          projectId,
          endpointUrl: endpoint(projectId),
          requestBody,
          controller,
          eventSourceMode,
          taskStreamTimeoutMs: TASK_STREAM_TIMEOUT_MS,
          applyAndCapture,
          pollTaskTerminalState: pollTaskTerminalStateFn,
          finalResultRef,
        })
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null
        }
        setIsLiveRunning(false)
      }
    },
    [
      applyAndCapture,
      buildRequestBody,
      endpoint,
      eventSourceMode,
      pollTaskTerminalStateFn,
      projectId,
      validateParams,
    ],
  )

  const stop = useCallback(() => {
    const runningTaskId = runState?.status === 'running' ? runState.runId : ''
    if (runningTaskId) {
      applyEvent({
        runId: runningTaskId,
        event: 'run.error',
        ts: new Date().toISOString(),
        status: 'failed',
        message: 'aborted',
      })
      void fetch(`/api/tasks/${runningTaskId}`, {
        method: 'DELETE',
      }).catch(() => null)
    }
    abortRef.current?.abort()
    abortRef.current = null
    setIsLiveRunning(false)
  }, [applyEvent, runState?.runId, runState?.status])

  const reset = useCallback(() => {
    stop()
    setRunState(null)
    finalResultRef.current = null
    setIsRecoveredRunning(false)
    clearRunSnapshot(storageKey)
  }, [storageKey, stop])

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!runState?.terminalAt) return
    const timer = window.setTimeout(() => {
      setRunState((prev) => {
        if (!prev || !prev.terminalAt) return prev
        if (Date.now() - prev.terminalAt < TERMINAL_CLEANUP_MS) return prev
        return null
      })
    }, TERMINAL_CLEANUP_MS + 100)
    return () => window.clearTimeout(timer)
  }, [runState?.terminalAt])

  const view = useMemo(() => {
    return deriveRunStreamView({
      runState,
      isLiveRunning,
      clock,
    })
  }, [clock, isLiveRunning, runState])

  const selectStep = useCallback((stepId: string) => {
    setRunState((prev) => {
      if (!prev || !prev.stepsById[stepId]) return prev
      return {
        ...prev,
        selectedStepId: stepId,
      }
    })
  }, [])

  return {
    runState,
    runId: runState?.runId || '',
    status: runState?.status || 'idle',
    isRunning: isLiveRunning,
    isRecoveredRunning,
    isVisible: view.isVisible,
    errorMessage: runState?.errorMessage || '',
    summary: runState?.summary || null,
    payload: runState?.payload || null,
    stages: view.stages,
    orderedSteps: view.orderedSteps,
    activeStepId: view.activeStepId,
    selectedStep: view.selectedStep,
    outputText: view.outputText,
    overallProgress: view.overallProgress,
    activeMessage: view.activeMessage,
    ingestTaskEvent,
    run,
    stop,
    reset,
    selectStep,
  }
}
