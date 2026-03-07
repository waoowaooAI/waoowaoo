import { TASK_EVENT_TYPE, TASK_SSE_EVENT_TYPE, type SSEEvent } from '@/lib/task/types'
import { RUN_EVENT_TYPE, type RunEventInput } from './types'

type JsonRecord = Record<string, unknown>

function toObject(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as JsonRecord
}

function readString(payload: JsonRecord, key: string): string | null {
  const value = payload[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function readInt(payload: JsonRecord, key: string): number | null {
  const value = payload[key]
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(1, Math.floor(value))
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) return Math.max(1, parsed)
  }
  return null
}

function resolveRunId(payload: JsonRecord): string | null {
  const direct = readString(payload, 'runId')
  if (direct) return direct
  const meta = toObject(payload.meta)
  return readString(meta, 'runId')
}

function normalizeLifecycleType(value: string | null): string | null {
  if (!value) return null
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

function stageLooksCompleted(stage: string | null): boolean {
  if (!stage) return false
  return (
    stage === 'llm_completed' ||
    stage === 'worker_llm_completed' ||
    stage === 'worker_llm_complete' ||
    stage === 'llm_proxy_persist' ||
    stage === 'completed'
  )
}

function stageLooksFailed(stage: string | null): boolean {
  if (!stage) return false
  return stage === 'llm_error' || stage === 'worker_llm_error' || stage === 'error'
}

export function mapTaskSSEEventToRunEvents(event: SSEEvent): RunEventInput[] {
  const payload = toObject(event.payload)
  const runId = resolveRunId(payload)
  if (!runId) return []

  const base = {
    runId,
    projectId: event.projectId,
    userId: event.userId,
  }

  const stepKey = readString(payload, 'stepKey') || readString(payload, 'stepId')
  const attempt = readInt(payload, 'stepAttempt') || readInt(payload, 'attempt')

  if (event.type === TASK_SSE_EVENT_TYPE.STREAM) {
    const stream = toObject(payload.stream)
    const delta = readString(stream, 'delta')
    if (!delta) return []
    const lane = readString(stream, 'lane')
    const kind = readString(stream, 'kind')
    const normalizedLane = lane === 'reasoning' || kind === 'reasoning' ? 'reasoning' : 'text'
    const resolvedStepKey = stepKey || (event.taskType ? `step:${event.taskType}` : null)
    if (!resolvedStepKey) return []
    return [{
      ...base,
      eventType: RUN_EVENT_TYPE.STEP_CHUNK,
      stepKey: resolvedStepKey,
      attempt,
      lane: normalizedLane,
      payload,
    }]
  }

  const lifecycleType = normalizeLifecycleType(readString(payload, 'lifecycleType'))
  if (!lifecycleType) return []

  if (lifecycleType === TASK_EVENT_TYPE.CREATED) {
    return [{
      ...base,
      eventType: RUN_EVENT_TYPE.RUN_START,
      payload,
    }]
  }

  if (lifecycleType === TASK_EVENT_TYPE.PROCESSING) {
    if (!stepKey) return []
    const events: RunEventInput[] = [{
      ...base,
      eventType: RUN_EVENT_TYPE.STEP_START,
      stepKey,
      attempt,
      payload,
    }]

    const stage = readString(payload, 'stage')
    const done = payload.done === true
    const hasErrorObject = Object.keys(toObject(payload.error)).length > 0
    if (done || stageLooksCompleted(stage)) {
      events.push({
        ...base,
        eventType: RUN_EVENT_TYPE.STEP_COMPLETE,
        stepKey,
        attempt,
        payload,
      })
      return events
    }

    if (stageLooksFailed(stage) || hasErrorObject) {
      events.push({
        ...base,
        eventType: RUN_EVENT_TYPE.STEP_ERROR,
        stepKey,
        attempt,
        payload,
      })
    }
    return events
  }

  if (lifecycleType === TASK_EVENT_TYPE.COMPLETED) {
    const events: RunEventInput[] = []
    if (stepKey) {
      events.push({
        ...base,
        eventType: RUN_EVENT_TYPE.STEP_COMPLETE,
        stepKey,
        attempt,
        payload,
      })
    }
    events.push({
      ...base,
      eventType: RUN_EVENT_TYPE.RUN_COMPLETE,
      payload,
    })
    return events
  }

  if (lifecycleType === TASK_EVENT_TYPE.FAILED) {
    const events: RunEventInput[] = []
    if (stepKey) {
      events.push({
        ...base,
        eventType: RUN_EVENT_TYPE.STEP_ERROR,
        stepKey,
        attempt,
        payload,
      })
    }
    events.push({
      ...base,
      eventType: RUN_EVENT_TYPE.RUN_ERROR,
      payload,
    })
    return events
  }

  return []
}
