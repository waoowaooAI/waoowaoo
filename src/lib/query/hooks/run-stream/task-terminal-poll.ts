import { resolveTaskErrorMessage } from '@/lib/task/error-message'
import { TASK_STATUS } from '@/lib/task/types'
import type { RunStreamEvent } from '@/lib/novel-promotion/run-stream/types'
import { readTextField, toObject, toTerminalRunResult } from './event-parser'
import type { RunResult } from './types'

type PollTaskTerminalStateArgs = {
  taskId: string
  applyAndCapture: (event: RunStreamEvent) => void
}

export async function pollTaskTerminalState({ taskId, applyAndCapture }: PollTaskTerminalStateArgs): Promise<RunResult | null> {
  try {
    const snapshotResponse = await fetch(`/api/tasks/${taskId}`, {
      method: 'GET',
      cache: 'no-store',
    })
    if (!snapshotResponse.ok) {
      const payload = toObject(await snapshotResponse.json().catch(() => null))
      const message = resolveTaskErrorMessage(
        payload,
        `task status request failed: HTTP ${snapshotResponse.status}`,
      )
      const terminalEvent: RunStreamEvent = {
        runId: taskId,
        event: 'run.error',
        ts: new Date().toISOString(),
        status: 'failed',
        message,
        payload: {
          ...payload,
          httpStatus: snapshotResponse.status,
        },
      }
      applyAndCapture(terminalEvent)
      return toTerminalRunResult(terminalEvent) || {
        runId: taskId,
        status: 'failed',
        summary: null,
        payload: terminalEvent.payload || null,
        errorMessage: message,
      }
    }
    const snapshotData = toObject(await snapshotResponse.json().catch(() => null))
    const task = toObject(snapshotData.task)
    const taskStatus = readTextField(task, 'status')
    if (taskStatus === TASK_STATUS.COMPLETED) {
      const payload = toObject(task.result)
      const terminalEvent: RunStreamEvent = {
        runId: taskId,
        event: 'run.complete',
        ts: new Date().toISOString(),
        status: 'completed',
        payload,
      }
      applyAndCapture(terminalEvent)
      return toTerminalRunResult(terminalEvent) || {
        runId: taskId,
        status: 'completed',
        summary: payload,
        payload,
        errorMessage: '',
      }
    }
    if (taskStatus === TASK_STATUS.FAILED) {
      const message = resolveTaskErrorMessage(task, 'run failed')
      const terminalEvent: RunStreamEvent = {
        runId: taskId,
        event: 'run.error',
        ts: new Date().toISOString(),
        status: 'failed',
        message,
        payload: task,
      }
      applyAndCapture(terminalEvent)
      return toTerminalRunResult(terminalEvent) || {
        runId: taskId,
        status: 'failed',
        summary: null,
        payload: task,
        errorMessage: message,
      }
    }
  } catch {
    // Ignore polling errors and let SSE continue.
  }
  return null
}
