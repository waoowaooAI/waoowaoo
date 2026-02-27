import type { RunStreamEvent } from '@/lib/novel-promotion/run-stream/types'
import { TASK_SSE_EVENT_TYPE, type SSEEvent } from '@/lib/task/types'
import { mapTaskSSEEventToRunEvents, toTerminalRunResult } from './event-parser'
import type { RunResult } from './types'

const POLL_INTERVAL_MS = 1500
const REPLAY_EVENTS_LIMIT = 5000

type SubscribeRecoveredRunArgs = {
  projectId: string
  storageScopeKey?: string
  taskId: string
  eventSourceMode: 'internal' | 'external'
  taskStreamTimeoutMs: number
  applyAndCapture: (event: RunStreamEvent) => void
  pollTaskTerminalState: (taskId: string) => Promise<RunResult | null>
  onSettled: () => void
}

type Cleanup = () => void

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function asEventArray(value: unknown): SSEEvent[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is SSEEvent => !!item && typeof item === 'object')
}

async function replayTaskLifecycleEvents(args: {
  taskId: string
  applyAndCapture: (event: RunStreamEvent) => void
  onTerminal: () => void
}) {
  try {
    const response = await fetch(`/api/tasks/${args.taskId}?includeEvents=1&eventsLimit=${REPLAY_EVENTS_LIMIT}`, {
      method: 'GET',
      cache: 'no-store',
    })
    if (!response.ok) return
    const payload = toObject(await response.json().catch(() => null))
    const events = asEventArray(payload.events)
    for (const taskEvent of events) {
      const runEvents = mapTaskSSEEventToRunEvents(taskEvent)
      for (const runEvent of runEvents) {
        args.applyAndCapture(runEvent)
        if (toTerminalRunResult(runEvent)) {
          args.onTerminal()
          return
        }
      }
    }
  } catch {
    // Ignore replay errors and continue with live SSE.
  }
}

export function subscribeRecoveredRun(args: SubscribeRecoveredRunArgs): Cleanup {
  if (args.eventSourceMode === 'external') {
    return subscribeRecoveredRunExternal(args)
  }
  return subscribeRecoveredRunInternal(args)
}

function subscribeRecoveredRunExternal(args: SubscribeRecoveredRunArgs): Cleanup {
  let settled = false
  let polling = false
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null

  function cleanup() {
    if (timeoutTimer) {
      clearTimeout(timeoutTimer)
      timeoutTimer = null
    }
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  function settle() {
    if (settled) return
    settled = true
    cleanup()
    args.onSettled()
  }

  async function pollTerminal() {
    if (settled || polling) return
    polling = true
    try {
      const terminal = await args.pollTaskTerminalState(args.taskId)
      if (terminal) {
        settle()
      }
    } finally {
      polling = false
    }
  }

  timeoutTimer = setTimeout(() => {
    settle()
  }, args.taskStreamTimeoutMs)
  pollTimer = setInterval(() => {
    void pollTerminal()
  }, POLL_INTERVAL_MS)
  void pollTerminal()
  void replayTaskLifecycleEvents({
    taskId: args.taskId,
    applyAndCapture: args.applyAndCapture,
    onTerminal: settle,
  })

  return cleanup
}

function subscribeRecoveredRunInternal(args: SubscribeRecoveredRunArgs): Cleanup {
  const search = new URLSearchParams({ projectId: args.projectId })
  if (args.storageScopeKey) search.set('episodeId', args.storageScopeKey)
  const source = new EventSource(`/api/sse?${search.toString()}`)
  let settled = false
  let polling = false
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null

  function cleanup() {
    if (timeoutTimer) {
      clearTimeout(timeoutTimer)
      timeoutTimer = null
    }
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    source.removeEventListener(TASK_SSE_EVENT_TYPE.LIFECYCLE, handleLifecycleEvent as EventListener)
    source.removeEventListener(TASK_SSE_EVENT_TYPE.STREAM, handleStreamEvent as EventListener)
    source.close()
  }

  function settle() {
    if (settled) return
    settled = true
    cleanup()
    args.onSettled()
  }

  function applyTaskMessage(rawData: string) {
    let taskEvent: SSEEvent
    try {
      taskEvent = JSON.parse(rawData) as SSEEvent
    } catch {
      return
    }
    if (!taskEvent || taskEvent.taskId !== args.taskId) return

    const runEvents = mapTaskSSEEventToRunEvents(taskEvent)
    for (const runEvent of runEvents) {
      args.applyAndCapture(runEvent)
      if (toTerminalRunResult(runEvent)) {
        settle()
        return
      }
    }
  }

  function handleLifecycleEvent(event: MessageEvent) {
    applyTaskMessage(event.data || '')
  }

  function handleStreamEvent(event: MessageEvent) {
    applyTaskMessage(event.data || '')
  }

  async function pollTerminal() {
    if (settled || polling) return
    polling = true
    try {
      const terminal = await args.pollTaskTerminalState(args.taskId)
      if (terminal) {
        settle()
      }
    } finally {
      polling = false
    }
  }

  timeoutTimer = setTimeout(() => {
    settle()
  }, args.taskStreamTimeoutMs)
  pollTimer = setInterval(() => {
    void pollTerminal()
  }, POLL_INTERVAL_MS)
  void pollTerminal()

  source.addEventListener(TASK_SSE_EVENT_TYPE.LIFECYCLE, handleLifecycleEvent as EventListener)
  source.addEventListener(TASK_SSE_EVENT_TYPE.STREAM, handleStreamEvent as EventListener)
  source.onerror = () => {
    void pollTerminal()
  }
  void replayTaskLifecycleEvents({
    taskId: args.taskId,
    applyAndCapture: args.applyAndCapture,
    onTerminal: settle,
  })

  return cleanup
}
