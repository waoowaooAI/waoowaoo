import type { MutableRefObject } from 'react'
import type { RunStreamEvent } from '@/lib/novel-promotion/run-stream/types'
import { isAsyncTaskResponse } from '@/lib/task/client'
import { resolveTaskErrorMessage } from '@/lib/task/error-message'
import { TASK_SSE_EVENT_TYPE, type SSEEvent } from '@/lib/task/types'
import {
  mapTaskSSEEventToRunEvents,
  toObject,
  toTerminalRunResult,
} from './event-parser'
import { streamSSEBody } from './run-stream-sse-body'
import type { RunResult } from './types'

type RunRequestExecutorArgs = {
  projectId: string
  endpointUrl: string
  requestBody: Record<string, unknown>
  controller: AbortController
  eventSourceMode: 'internal' | 'external'
  taskStreamTimeoutMs: number
  applyAndCapture: (streamEvent: RunStreamEvent) => void
  pollTaskTerminalState: (taskId: string) => Promise<RunResult | null>
  finalResultRef: MutableRefObject<RunResult | null>
}

const POLL_INTERVAL_MS = 1500

function buildFailedResult(runId: string, errorMessage: string): RunResult {
  return {
    runId,
    status: 'failed',
    summary: null,
    payload: null,
    errorMessage,
  }
}

async function waitExternalTaskTerminal(args: {
  taskId: string
  episodeIdForStream: string | null
  controller: AbortController
  taskStreamTimeoutMs: number
  applyAndCapture: (streamEvent: RunStreamEvent) => void
  pollTaskTerminalState: (taskId: string) => Promise<RunResult | null>
  finalResultRef: MutableRefObject<RunResult | null>
}): Promise<RunResult> {
  return await new Promise<RunResult>((resolve) => {
    let settled = false
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let checkCapturedTimer: ReturnType<typeof setInterval> | null = null
    let polling = false

    function cleanup() {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer)
        timeoutTimer = null
      }
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
      if (checkCapturedTimer) {
        clearInterval(checkCapturedTimer)
        checkCapturedTimer = null
      }
      args.controller.signal.removeEventListener('abort', handleAbort)
    }

    function settle(runResult: RunResult) {
      if (settled) return
      settled = true
      cleanup()
      resolve(runResult)
    }

    function settleWithError(message: string) {
      const failed = buildFailedResult(args.taskId, message)
      args.applyAndCapture({
        runId: args.taskId,
        event: 'run.error',
        ts: new Date().toISOString(),
        status: 'failed',
        message,
      })
      settle(failed)
    }

    function tryResolveFromCapturedTerminal() {
      const captured = args.finalResultRef.current
      if (!captured || captured.runId !== args.taskId) return
      if (captured.status !== 'completed' && captured.status !== 'failed') return
      settle(captured)
    }

    async function pollTaskUntilTerminal() {
      if (settled || polling) return
      polling = true
      try {
        const terminal = await args.pollTaskTerminalState(args.taskId)
        if (terminal) {
          settle(terminal)
        }
      } finally {
        polling = false
      }
    }

    function handleAbort() {
      settleWithError('aborted')
    }

    timeoutTimer = setTimeout(() => {
      settleWithError(`task stream timeout: ${args.taskId}`)
    }, args.taskStreamTimeoutMs)
    pollTimer = setInterval(() => {
      void pollTaskUntilTerminal()
    }, POLL_INTERVAL_MS)
    checkCapturedTimer = setInterval(() => {
      tryResolveFromCapturedTerminal()
    }, 250)
    void pollTaskUntilTerminal()

    args.applyAndCapture({
      runId: args.taskId,
      event: 'run.start',
      ts: new Date().toISOString(),
      status: 'running',
      payload: {
        taskId: args.taskId,
        ...(args.episodeIdForStream ? { episodeId: args.episodeIdForStream } : {}),
      },
    })
    args.controller.signal.addEventListener('abort', handleAbort)
  })
}

async function waitInternalTaskTerminal(args: {
  projectId: string
  taskId: string
  episodeIdForStream: string | null
  controller: AbortController
  taskStreamTimeoutMs: number
  applyAndCapture: (streamEvent: RunStreamEvent) => void
  pollTaskTerminalState: (taskId: string) => Promise<RunResult | null>
}): Promise<RunResult> {
  return await new Promise<RunResult>((resolve) => {
    const search = new URLSearchParams({ projectId: args.projectId })
    if (args.episodeIdForStream) search.set('episodeId', args.episodeIdForStream)
    const source = new EventSource(`/api/sse?${search}`)
    let settled = false
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let polling = false

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
      args.controller.signal.removeEventListener('abort', handleAbort)
      source.close()
    }

    function settle(runResult: RunResult) {
      if (settled) return
      settled = true
      cleanup()
      resolve(runResult)
    }

    function settleWithError(message: string) {
      const failed = buildFailedResult(args.taskId, message)
      args.applyAndCapture({
        runId: args.taskId,
        event: 'run.error',
        ts: new Date().toISOString(),
        status: 'failed',
        message,
      })
      settle(failed)
    }

    function handleTaskMessage(rawData: string) {
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
        const terminalResult = toTerminalRunResult(runEvent)
        if (terminalResult) {
          settle(terminalResult)
          return
        }
      }
    }

    function handleLifecycleEvent(event: MessageEvent) {
      handleTaskMessage(event.data || '')
    }

    function handleStreamEvent(event: MessageEvent) {
      handleTaskMessage(event.data || '')
    }

    function handleAbort() {
      settleWithError('aborted')
    }

    async function pollTaskUntilTerminal() {
      if (settled || polling) return
      polling = true
      try {
        const terminal = await args.pollTaskTerminalState(args.taskId)
        if (terminal) {
          settle(terminal)
        }
      } finally {
        polling = false
      }
    }

    timeoutTimer = setTimeout(() => {
      settleWithError(`task stream timeout: ${args.taskId}`)
    }, args.taskStreamTimeoutMs)
    pollTimer = setInterval(() => {
      void pollTaskUntilTerminal()
    }, POLL_INTERVAL_MS)
    void pollTaskUntilTerminal()

    args.applyAndCapture({
      runId: args.taskId,
      event: 'run.start',
      ts: new Date().toISOString(),
      status: 'running',
      payload: { taskId: args.taskId },
    })

    args.controller.signal.addEventListener('abort', handleAbort)
    source.addEventListener(TASK_SSE_EVENT_TYPE.LIFECYCLE, handleLifecycleEvent as EventListener)
    source.addEventListener(TASK_SSE_EVENT_TYPE.STREAM, handleStreamEvent as EventListener)
    source.onerror = () => {
      if (args.controller.signal.aborted) {
        settleWithError('aborted')
      }
    }
  })
}

export async function executeRunRequest(args: RunRequestExecutorArgs): Promise<RunResult> {
  try {
    const response = await fetch(args.endpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args.requestBody),
      signal: args.controller.signal,
    })

    if (!response.ok) {
      const jsonPayload = await response.clone().json().catch(() => null)
      if (jsonPayload && typeof jsonPayload === 'object') {
        throw new Error(resolveTaskErrorMessage(jsonPayload as Record<string, unknown>, `HTTP ${response.status}`))
      }
      const message = await response.text().catch(() => '')
      throw new Error(message || `HTTP ${response.status}`)
    }

    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('text/event-stream') && response.body) {
      await streamSSEBody({
        responseBody: response.body,
        applyAndCapture: args.applyAndCapture,
      })
    } else {
      const data = await response.json().catch(() => null)
      if (isAsyncTaskResponse(data)) {
        const taskId = data.taskId
        const episodeIdForStream =
          typeof args.requestBody.episodeId === 'string' && args.requestBody.episodeId.trim()
            ? args.requestBody.episodeId.trim()
            : null

        const result = args.eventSourceMode === 'external'
          ? await waitExternalTaskTerminal({
              taskId,
              episodeIdForStream,
              controller: args.controller,
              taskStreamTimeoutMs: args.taskStreamTimeoutMs,
              applyAndCapture: args.applyAndCapture,
              pollTaskTerminalState: args.pollTaskTerminalState,
              finalResultRef: args.finalResultRef,
            })
          : await waitInternalTaskTerminal({
              projectId: args.projectId,
              taskId,
              episodeIdForStream,
              controller: args.controller,
              taskStreamTimeoutMs: args.taskStreamTimeoutMs,
              applyAndCapture: args.applyAndCapture,
              pollTaskTerminalState: args.pollTaskTerminalState,
            })

        args.finalResultRef.current = result
        return result
      }

      const payload = toObject(data)
      const success = payload.success !== false
      const result: RunResult = {
        runId: typeof payload.runId === 'string' ? payload.runId : '',
        status: success ? 'completed' : 'failed',
        summary: payload,
        payload,
        errorMessage: success ? '' : (typeof payload.message === 'string' ? payload.message : 'run failed'),
      }
      args.finalResultRef.current = result
      return result
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      const aborted =
        args.finalResultRef.current || buildFailedResult('', 'aborted')
      args.finalResultRef.current = aborted
      return aborted
    }

    const message = error instanceof Error ? error.message : String(error)
    args.finalResultRef.current = buildFailedResult('', message)
    throw error
  }

  const fallback =
    args.finalResultRef.current || buildFailedResult('', 'stream closed without terminal event')
  args.finalResultRef.current = fallback
  return fallback
}
