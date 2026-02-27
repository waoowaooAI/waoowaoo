import type { RunStreamEvent } from '@/lib/novel-promotion/run-stream/types'
import { TASK_EVENT_TYPE, TASK_SSE_EVENT_TYPE, type SSEEvent } from '@/lib/task/types'
import { resolveTaskErrorMessage as resolveUnifiedTaskErrorMessage } from '@/lib/task/error-message'
import type { RunResult } from './types'

export function parseSSEBlock(block: string): { event: string; data: string } | null {
  const lines = block.split('\n')
  let event = 'message'
  const dataLines: string[] = []

  for (const line of lines) {
    if (!line) continue
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
      continue
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim())
    }
  }

  if (dataLines.length === 0) return null
  return {
    event,
    data: dataLines.join('\n'),
  }
}

export function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export function readTextField(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key]
  return typeof value === 'string' ? value : undefined
}

export function readStepField(payload: Record<string, unknown>, key: string): number | undefined {
  const value = payload[key]
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : undefined
}

function normalizeLifecycleType(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (value === TASK_EVENT_TYPE.PROGRESS) return TASK_EVENT_TYPE.PROCESSING
  if (
    value === TASK_EVENT_TYPE.CREATED ||
    value === TASK_EVENT_TYPE.PROCESSING ||
    value === TASK_EVENT_TYPE.COMPLETED ||
    value === TASK_EVENT_TYPE.FAILED
  ) {
    return value
  }
  return null
}

function stageLooksCompleted(stage: string | undefined) {
  if (!stage) return false
  return (
    stage === 'llm_completed' ||
    stage === 'worker_llm_completed' ||
    stage === 'worker_llm_complete' ||
    stage === 'llm_proxy_persist' ||
    stage === 'completed'
  )
}

function stageLooksFailed(stage: string | undefined) {
  if (!stage) return false
  return stage === 'llm_error' || stage === 'worker_llm_error' || stage === 'error'
}

function resolveTaskErrorMessage(payload: Record<string, unknown>, fallback = 'task failed') {
  return resolveUnifiedTaskErrorMessage(payload, fallback)
}

function extractTerminalPayload(payload: Record<string, unknown>) {
  const result = toObject(payload.result)
  if (Object.keys(result).length > 0) {
    return result
  }
  return payload
}

export function mapTaskSSEEventToRunEvents(event: SSEEvent): RunStreamEvent[] {
  const runId = typeof event.taskId === 'string' ? event.taskId : ''
  if (!runId) return []
  const payload = toObject(event.payload)
  const lifecycleType =
    event.type === TASK_SSE_EVENT_TYPE.LIFECYCLE
      ? normalizeLifecycleType(payload.lifecycleType)
      : null
  const ts = typeof event.ts === 'string' ? event.ts : new Date().toISOString()
  const flowStageTitle = readTextField(payload, 'flowStageTitle')
  const flowStageIndex = readStepField(payload, 'flowStageIndex')
  const flowStageTotal = readStepField(payload, 'flowStageTotal')
  const rawStepId = readTextField(payload, 'stepId')
  const rawStepTitle = readTextField(payload, 'stepTitle')
  const stepId =
    rawStepId ||
    (
      event.type === TASK_SSE_EVENT_TYPE.STREAM
      ? `step:${event.taskType || 'llm'}`
      : undefined)
  const stepAttempt = readStepField(payload, 'stepAttempt')
  const stepTitle = rawStepTitle || flowStageTitle || undefined
  const stepIndex = readStepField(payload, 'stepIndex') ?? flowStageIndex
  const stepTotal = readStepField(payload, 'stepTotal') ?? flowStageTotal
  const stage = readTextField(payload, 'stage')
  const message = readTextField(payload, 'message')
  const done = payload.done === true
  const text = readTextField(payload, 'output') || readTextField(payload, 'text')
  const reasoning = readTextField(payload, 'reasoning') || readTextField(payload, 'thinking')

  if (event.type === TASK_SSE_EVENT_TYPE.STREAM) {
    const stream = toObject(payload.stream)
    const kind = stream.kind === 'reasoning' ? 'reasoning' : 'text'
    const delta = typeof stream.delta === 'string' ? stream.delta : ''
    if (!delta || !stepId) return []
    const lane = stream.lane === 'reasoning' || kind === 'reasoning' ? 'reasoning' : 'text'
    const seq =
      typeof stream.seq === 'number' && Number.isFinite(stream.seq) ? Math.max(1, Math.floor(stream.seq)) : undefined
    const streamStepAttempt =
      typeof stream.attempt === 'number' && Number.isFinite(stream.attempt)
        ? Math.max(1, Math.floor(stream.attempt))
        : undefined

    return [{
      runId,
      event: 'step.chunk',
      ts,
      status: 'running',
      stepId,
      stepAttempt: stepAttempt ?? streamStepAttempt,
      stepTitle,
      stepIndex,
      stepTotal,
      lane,
      seq,
      textDelta: lane === 'text' ? delta : undefined,
      reasoningDelta: lane === 'reasoning' ? delta : undefined,
      message,
    }]
  }

  if (event.type !== TASK_SSE_EVENT_TYPE.LIFECYCLE) return []

  const runEvents: RunStreamEvent[] = []

  if (lifecycleType === TASK_EVENT_TYPE.CREATED) {
    runEvents.push({
      runId,
      event: 'run.start',
      ts,
      status: 'running',
      message,
      payload,
    })
    return runEvents
  }

  if (lifecycleType === TASK_EVENT_TYPE.PROCESSING) {
    if (stepId) {
      runEvents.push({
        runId,
        event: 'step.start',
        ts,
        status: 'running',
        stepId,
        stepAttempt,
        stepTitle,
        stepIndex,
        stepTotal,
        message,
      })
      if (done || stageLooksCompleted(stage)) {
        runEvents.push({
          runId,
          event: 'step.complete',
          ts,
          status: 'completed',
          stepId,
          stepAttempt,
          stepTitle,
          stepIndex,
          stepTotal,
          text,
          reasoning,
          message,
        })
      } else if (stageLooksFailed(stage)) {
        runEvents.push({
          runId,
          event: 'step.error',
          ts,
          status: 'failed',
          stepId,
          stepAttempt,
          stepTitle,
          stepIndex,
          stepTotal,
          message: resolveTaskErrorMessage(payload),
        })
      }
    }
    return runEvents
  }

  if (lifecycleType === TASK_EVENT_TYPE.COMPLETED) {
    if (stepId) {
      runEvents.push({
        runId,
        event: 'step.complete',
        ts,
        status: 'completed',
        stepId,
        stepAttempt,
        stepTitle,
        stepIndex,
        stepTotal,
        text,
        reasoning,
        message,
      })
    }
    runEvents.push({
      runId,
      event: 'run.complete',
      ts,
      status: 'completed',
      message,
      payload: extractTerminalPayload(payload),
    })
    return runEvents
  }

  if (lifecycleType === TASK_EVENT_TYPE.FAILED) {
    const errorMessage = resolveTaskErrorMessage(payload)
    if (stepId) {
      runEvents.push({
        runId,
        event: 'step.error',
        ts,
        status: 'failed',
        stepId,
        stepAttempt,
        stepTitle,
        stepIndex,
        stepTotal,
        message: errorMessage,
      })
    }
    runEvents.push({
      runId,
      event: 'run.error',
      ts,
      status: 'failed',
      message: errorMessage,
      payload,
    })
  }

  return runEvents
}

export function toTerminalRunResult(event: RunStreamEvent): RunResult | null {
  if (event.event !== 'run.complete' && event.event !== 'run.error') return null

  const summaryFromPayload =
    event.payload &&
    typeof event.payload.summary === 'object' &&
    event.payload.summary
      ? (event.payload.summary as Record<string, unknown>)
      : null

  return {
    runId: event.runId,
    status: event.event === 'run.complete' ? 'completed' : 'failed',
    summary:
      event.event === 'run.complete'
        ? summaryFromPayload || event.payload || null
        : summaryFromPayload,
    payload: event.payload || null,
    errorMessage: event.event === 'run.error' ? event.message || 'run failed' : '',
  }
}
