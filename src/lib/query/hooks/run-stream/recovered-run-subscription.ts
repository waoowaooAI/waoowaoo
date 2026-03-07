import type { RunStreamEvent } from '@/lib/novel-promotion/run-stream/types'
import { toTerminalRunResult } from './event-parser'
import { fetchRunEventsPage, toRunStreamEventFromRunApi } from './run-event-adapter'
import { apiFetch } from '@/lib/api-fetch'

const POLL_INTERVAL_MS = 1500
const RUN_TERMINAL_RECONCILE_EMPTY_POLLS = 2

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

async function reconcileRunTerminalState(runId: string): Promise<{
  status: 'completed' | 'failed'
  message?: string
  payload?: Record<string, unknown>
} | null> {
  const response = await apiFetch(`/api/runs/${runId}`, {
    method: 'GET',
    cache: 'no-store',
  })
  if (!response.ok) return null

  const snapshot = await response.json().catch(() => null)
  const root = toObject(snapshot)
  const run = toObject(root.run)
  const status = readText(run.status)
  if (status === 'completed') {
    const output = toObject(run.output)
    return {
      status: 'completed',
      payload: Object.keys(output).length > 0 ? output : run,
    }
  }
  if (status === 'failed' || status === 'canceled') {
    return {
      status: 'failed',
      message: readText(run.errorMessage) || `run ${status}`,
      payload: run,
    }
  }
  return null
}

type SubscribeRecoveredRunArgs = {
  runId: string
  taskStreamTimeoutMs: number
  applyAndCapture: (event: RunStreamEvent) => void
  onSettled: () => void
}

type Cleanup = () => void

export function subscribeRecoveredRun(args: SubscribeRecoveredRunArgs): Cleanup {
  let settled = false
  let polling = false
  let afterSeq = 0
  let emptyPollCount = 0
  let idleTimeoutTimer: ReturnType<typeof setTimeout> | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null

  function cleanup() {
    if (idleTimeoutTimer) {
      clearTimeout(idleTimeoutTimer)
      idleTimeoutTimer = null
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

  function scheduleIdleTimeout() {
    if (idleTimeoutTimer) {
      clearTimeout(idleTimeoutTimer)
    }
    idleTimeoutTimer = setTimeout(() => {
      if (settled) return
      const timeoutMessage = `run stream timeout: ${args.runId}`
      args.applyAndCapture({
        runId: args.runId,
        event: 'run.error',
        ts: new Date().toISOString(),
        status: 'failed',
        message: timeoutMessage,
      })
      settle()
    }, args.taskStreamTimeoutMs)
  }

  async function pollRunEvents() {
    if (settled || polling) return
    polling = true
    try {
      const rows = await fetchRunEventsPage({
        runId: args.runId,
        afterSeq,
      })

      let sawNewEvent = false
      for (const row of rows) {
        if (row.seq <= afterSeq) continue

        sawNewEvent = true
        if (row.seq > afterSeq + 1) {
          const gapRows = await fetchRunEventsPage({
            runId: args.runId,
            afterSeq,
          })
          for (const gapRow of gapRows) {
            if (gapRow.seq <= afterSeq) continue
            scheduleIdleTimeout()
            afterSeq = gapRow.seq
            const gapEvent = toRunStreamEventFromRunApi({
              runId: args.runId,
              event: gapRow,
            })
            if (!gapEvent) continue
            args.applyAndCapture(gapEvent)
            if (toTerminalRunResult(gapEvent)) {
              settle()
              return
            }
          }
          continue
        }

        scheduleIdleTimeout()
        afterSeq = row.seq
        const streamEvent = toRunStreamEventFromRunApi({
          runId: args.runId,
          event: row,
        })
        if (!streamEvent) continue

        args.applyAndCapture(streamEvent)
        if (toTerminalRunResult(streamEvent)) {
          settle()
          return
        }
      }

      if (sawNewEvent) {
        emptyPollCount = 0
      } else {
        emptyPollCount += 1
        if (emptyPollCount >= RUN_TERMINAL_RECONCILE_EMPTY_POLLS) {
          const reconciled = await reconcileRunTerminalState(args.runId)
          if (reconciled) {
            if (reconciled.status === 'completed') {
              args.applyAndCapture({
                runId: args.runId,
                event: 'run.complete',
                ts: new Date().toISOString(),
                status: 'completed',
                payload: reconciled.payload,
              })
            } else {
              args.applyAndCapture({
                runId: args.runId,
                event: 'run.error',
                ts: new Date().toISOString(),
                status: 'failed',
                message: reconciled.message || 'run failed',
                payload: reconciled.payload,
              })
            }
            settle()
            return
          }
          emptyPollCount = 0
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      args.applyAndCapture({
        runId: args.runId,
        event: 'run.error',
        ts: new Date().toISOString(),
        status: 'failed',
        message,
      })
      settle()
      return
    } finally {
      polling = false
    }
  }

  scheduleIdleTimeout()

  pollTimer = setInterval(() => {
    void pollRunEvents()
  }, POLL_INTERVAL_MS)

  void pollRunEvents()

  return cleanup
}
