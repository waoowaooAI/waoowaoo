import type { RunStreamEvent } from '@/lib/novel-promotion/run-stream/types'
import { apiFetch } from '@/lib/api-fetch'

type JsonRecord = Record<string, unknown>

export type RunApiEvent = {
  seq: number
  eventType: string
  stepKey?: string | null
  attempt?: number | null
  lane?: string | null
  payload?: JsonRecord | null
  createdAt?: string
}

function toObject(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as JsonRecord
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const rows: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (!trimmed) continue
    rows.push(trimmed)
  }
  return rows
}

function readBool(value: unknown): boolean | undefined {
  if (value === true) return true
  if (value === false) return false
  return undefined
}

function resolveErrorMessage(payload: JsonRecord, fallback: string): string {
  const direct = readText(payload.message)
  if (direct) return direct
  const nested = readText(toObject(payload.error).message)
  return nested || fallback
}

export function parseRunApiEventsPayload(payload: unknown): RunApiEvent[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return []
  const root = payload as JsonRecord
  if (!Array.isArray(root.events)) return []

  const rows: RunApiEvent[] = []
  for (const item of root.events) {
    const row = toObject(item)
    const seq = typeof row.seq === 'number' && Number.isFinite(row.seq)
      ? Math.max(1, Math.floor(row.seq))
      : 0
    if (seq <= 0) continue

    rows.push({
      seq,
      eventType: readText(row.eventType),
      stepKey: readText(row.stepKey) || null,
      attempt:
        typeof row.attempt === 'number' && Number.isFinite(row.attempt)
          ? Math.max(1, Math.floor(row.attempt))
          : null,
      lane: readText(row.lane) || null,
      payload: toObject(row.payload),
      createdAt: readText(row.createdAt) || undefined,
    })
  }

  return rows
}

export function toRunStreamEventFromRunApi(params: {
  runId: string
  event: RunApiEvent
}): RunStreamEvent | null {
  const payload = toObject(params.event.payload)
  const stepId = typeof params.event.stepKey === 'string' ? params.event.stepKey : undefined
  const stepAttempt =
    typeof params.event.attempt === 'number' && Number.isFinite(params.event.attempt)
      ? Math.max(1, Math.floor(params.event.attempt))
      : undefined
  const stepTitle = readText(payload.stepTitle) || undefined
  const stepIndex =
    typeof payload.stepIndex === 'number' && Number.isFinite(payload.stepIndex)
      ? Math.max(1, Math.floor(payload.stepIndex))
      : undefined
  const stepTotal =
    typeof payload.stepTotal === 'number' && Number.isFinite(payload.stepTotal)
      ? Math.max(stepIndex || 1, Math.floor(payload.stepTotal))
      : undefined
  const ts = readText(params.event.createdAt) || new Date().toISOString()
  const message = readText(payload.message) || undefined
  const dependsOn = readStringArray(payload.dependsOn)
  const blockedBy = readStringArray(payload.blockedBy)
  const groupId = readText(payload.groupId) || undefined
  const parallelKey = readText(payload.parallelKey) || undefined
  const retryable = readBool(payload.retryable)
  const stale = readBool(payload.stale)

  if (params.event.eventType === 'run.start') {
    return {
      runId: params.runId,
      event: 'run.start',
      ts,
      status: 'running',
      message,
      payload,
    }
  }

  if (params.event.eventType === 'run.complete') {
    return {
      runId: params.runId,
      event: 'run.complete',
      ts,
      status: 'completed',
      message,
      payload,
    }
  }

  if (params.event.eventType === 'run.error') {
    return {
      runId: params.runId,
      event: 'run.error',
      ts,
      status: 'failed',
      message: resolveErrorMessage(payload, 'run failed'),
      payload,
    }
  }

  if (params.event.eventType === 'run.canceled') {
    return {
      runId: params.runId,
      event: 'run.error',
      ts,
      status: 'failed',
      message: resolveErrorMessage(payload, 'run canceled'),
      payload,
    }
  }

  if (params.event.eventType === 'step.start') {
    if (!stepId) return null
    return {
      runId: params.runId,
      event: 'step.start',
      ts,
      status: 'running',
      stepId,
      stepAttempt,
      stepTitle,
      stepIndex,
      stepTotal,
      dependsOn: dependsOn.length > 0 ? dependsOn : undefined,
      blockedBy: blockedBy.length > 0 ? blockedBy : undefined,
      groupId,
      parallelKey,
      retryable,
      message,
    }
  }

  if (params.event.eventType === 'step.chunk') {
    if (!stepId) return null
    const stream = toObject(payload.stream)
    const lane =
      params.event.lane === 'reasoning' || stream.lane === 'reasoning' || stream.kind === 'reasoning'
        ? 'reasoning'
        : 'text'
    const delta = readText(stream.delta)
    if (!delta) return null
    const laneSeq =
      typeof stream.seq === 'number' && Number.isFinite(stream.seq)
        ? Math.max(1, Math.floor(stream.seq))
        : Math.max(1, Math.floor(params.event.seq))

    return {
      runId: params.runId,
      event: 'step.chunk',
      ts,
      status: 'running',
      stepId,
      stepAttempt,
      stepTitle,
      stepIndex,
      stepTotal,
      dependsOn: dependsOn.length > 0 ? dependsOn : undefined,
      blockedBy: blockedBy.length > 0 ? blockedBy : undefined,
      groupId,
      parallelKey,
      retryable,
      lane,
      seq: laneSeq,
      textDelta: lane === 'text' ? delta : undefined,
      reasoningDelta: lane === 'reasoning' ? delta : undefined,
      message,
    }
  }

  if (params.event.eventType === 'step.complete') {
    if (!stepId) return null
    const text = readText(payload.text) || readText(payload.output) || undefined
    const reasoning = readText(payload.reasoning) || undefined
    return {
      runId: params.runId,
      event: 'step.complete',
      ts,
      stepId,
      stepAttempt,
      stepTitle,
      stepIndex,
      stepTotal,
      status: stale ? 'stale' : 'completed',
      dependsOn: dependsOn.length > 0 ? dependsOn : undefined,
      blockedBy: blockedBy.length > 0 ? blockedBy : undefined,
      groupId,
      parallelKey,
      retryable,
      text,
      reasoning,
      message,
    }
  }

  if (params.event.eventType === 'step.error') {
    if (!stepId) return null
    return {
      runId: params.runId,
      event: 'step.error',
      ts,
      status: 'failed',
      stepId,
      stepAttempt,
      stepTitle,
      stepIndex,
      stepTotal,
      dependsOn: dependsOn.length > 0 ? dependsOn : undefined,
      blockedBy: blockedBy.length > 0 ? blockedBy : undefined,
      groupId,
      parallelKey,
      retryable,
      message: resolveErrorMessage(payload, 'step failed'),
      payload,
    }
  }

  return null
}

export async function fetchRunEventsPage(params: {
  runId: string
  afterSeq: number
  limit?: number
}): Promise<RunApiEvent[]> {
  const safeAfterSeq = Number.isFinite(params.afterSeq)
    ? Math.max(0, Math.floor(params.afterSeq))
    : 0
  const safeLimit = Number.isFinite(params.limit || 500)
    ? Math.min(Math.max(Math.floor(params.limit || 500), 1), 2000)
    : 500

  const response = await apiFetch(
    `/api/runs/${params.runId}/events?afterSeq=${safeAfterSeq}&limit=${safeLimit}`,
    {
      method: 'GET',
      cache: 'no-store',
    },
  )
  if (!response.ok) {
    const errorJson = await response.clone().json().catch(() => null)
    const errorRoot = toObject(errorJson)
    const errorMessage =
      readText(toObject(errorRoot.error).message) ||
      readText(errorRoot.message) ||
      (await response.text().catch(() => ''))

    if (errorMessage) {
      throw new Error(`run events fetch failed (HTTP ${response.status}): ${errorMessage}`)
    }
    throw new Error(`run events fetch failed (HTTP ${response.status})`)
  }

  const payload = await response.json().catch(() => null)
  return parseRunApiEventsPayload(payload)
}
