import { prisma } from '@/lib/prisma'
import {
  TASK_EVENT_TYPE,
  TASK_SSE_EVENT_TYPE,
  type TaskEventType,
  type TaskLifecycleEventType,
  type SSEEvent,
} from './types'
import { coerceTaskIntent, resolveTaskIntent } from './intent'
import { mapTaskSSEEventToRunEvents } from '@/lib/run-runtime/task-bridge'
import { publishRunEvent } from '@/lib/run-runtime/publisher'

const CHANNEL_PREFIX = 'task-events:project:'
const STREAM_EPHEMERAL_ENABLED = process.env.LLM_STREAM_EPHEMERAL_ENABLED !== 'false'

type TaskEventRow = {
  id: string
  taskId: string
  projectId: string
  userId: string
  eventType: string
  payload: Record<string, unknown> | null
  seq: number
  createdAt: Date
}

type TaskMeta = {
  id: string
  type: string
  targetType: string
  targetId: string
  episodeId: string | null
}

type TaskEventModel = {
  create: (args: unknown) => Promise<TaskEventRow>
  findMany: (args: unknown) => Promise<TaskEventRow[]>
  findFirst: (args: unknown) => Promise<TaskEventRow | null>
}

type TaskModel = {
  findMany: (args: unknown) => Promise<TaskMeta[]>
}

const taskEventModel = (prisma as unknown as { taskEvent: TaskEventModel }).taskEvent
const taskModel = (prisma as unknown as { task: TaskModel }).task

async function resolveNextEventSeq(taskId: string): Promise<number> {
  const latest = await taskEventModel.findFirst({
    where: { taskId },
    orderBy: { seq: 'desc' },
    select: { seq: true },
  })
  return (latest?.seq || 0) + 1
}

function isLifecycleEventType(value: string): value is TaskLifecycleEventType {
  return value === TASK_EVENT_TYPE.CREATED ||
    value === TASK_EVENT_TYPE.PROCESSING ||
    value === TASK_EVENT_TYPE.COMPLETED ||
    value === TASK_EVENT_TYPE.FAILED
}

function normalizeLifecycleType(type: TaskEventType): TaskLifecycleEventType {
  if (isLifecycleEventType(type)) return type
  return TASK_EVENT_TYPE.PROCESSING
}

function isStreamEventType(type: string) {
  return type === TASK_SSE_EVENT_TYPE.STREAM
}

function shouldReplayLifecycleRow(type: string) {
  return isLifecycleEventType(type)
}

function shouldReplayTaskRow(type: string) {
  return shouldReplayLifecycleRow(type) || isStreamEventType(type)
}

function normalizeLifecyclePayload(
  type: TaskEventType,
  taskType: string | null | undefined,
  payload?: Record<string, unknown> | null,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(payload || {}) }
  const lifecycleType = normalizeLifecycleType(type)
  const payloadUi = next.ui && typeof next.ui === 'object' && !Array.isArray(next.ui)
    ? (next.ui as Record<string, unknown>)
    : null
  next.lifecycleType = lifecycleType
  next.intent = coerceTaskIntent(next.intent ?? payloadUi?.intent, taskType)

  return next
}

function buildLifecycleEvent(params: {
  id: string
  ts: string
  lifecycleType: TaskEventType
  taskId: string
  projectId: string
  userId: string
  taskType?: string | null
  targetType?: string | null
  targetId?: string | null
  episodeId?: string | null
  payload?: Record<string, unknown> | null
}): SSEEvent {
  return {
    id: params.id,
    type: TASK_SSE_EVENT_TYPE.LIFECYCLE,
    taskId: params.taskId,
    projectId: params.projectId,
    userId: params.userId,
    ts: params.ts,
    taskType: params.taskType || null,
    targetType: params.targetType || null,
    targetId: params.targetId || null,
    episodeId: params.episodeId || null,
    payload: normalizeLifecyclePayload(params.lifecycleType, params.taskType, params.payload || null),
  }
}

function normalizeStreamPayload(
  taskType: string | null | undefined,
  payload?: Record<string, unknown> | null,
): Record<string, unknown> {
  return {
    ...(payload || {}),
    intent: resolveTaskIntent(taskType),
  }
}

function buildStreamEvent(params: {
  id: string
  ts: string
  taskId: string
  projectId: string
  userId: string
  taskType?: string | null
  targetType?: string | null
  targetId?: string | null
  episodeId?: string | null
  payload?: Record<string, unknown> | null
}): SSEEvent {
  return {
    id: params.id,
    type: TASK_SSE_EVENT_TYPE.STREAM,
    taskId: params.taskId,
    projectId: params.projectId,
    userId: params.userId,
    ts: params.ts,
    taskType: params.taskType || null,
    targetType: params.targetType || null,
    targetId: params.targetId || null,
    episodeId: params.episodeId || null,
    payload: normalizeStreamPayload(params.taskType, params.payload || null),
  }
}

async function mapRowsToReplayEvents(rows: TaskEventRow[]): Promise<SSEEvent[]> {
  if (rows.length === 0) return []

  const taskIds = Array.from(new Set(rows.map((row) => row.taskId)))
  const tasks: TaskMeta[] = taskIds.length
    ? await taskModel.findMany({
        where: { id: { in: taskIds } },
        select: {
          id: true,
          type: true,
          targetType: true,
          targetId: true,
          episodeId: true,
        },
      })
    : []
  const taskMap = new Map<string, TaskMeta>(tasks.map((task) => [task.id, task]))

  return rows.map((row): SSEEvent => {
    const task = taskMap.get(row.taskId)
    if (isStreamEventType(row.eventType)) {
      return buildStreamEvent({
        id: String(row.id),
        ts: row.createdAt.toISOString(),
        taskId: row.taskId,
        projectId: row.projectId,
        userId: row.userId,
        taskType: task?.type || null,
        targetType: task?.targetType || null,
        targetId: task?.targetId || null,
        episodeId: task?.episodeId || null,
        payload: row.payload || null,
      })
    }
    const lifecycleType = row.eventType as TaskEventType
    return buildLifecycleEvent({
      id: String(row.id),
      ts: row.createdAt.toISOString(),
      lifecycleType,
      taskId: row.taskId,
      projectId: row.projectId,
      userId: row.userId,
      taskType: task?.type || null,
      targetType: task?.targetType || null,
      targetId: task?.targetId || null,
      episodeId: task?.episodeId || null,
      payload: row.payload || null,
    })
  })
}

export async function listTaskLifecycleEvents(taskId: string, limit = 500) {
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 5000) : 500
  const latestRows = await taskEventModel.findMany({
    where: { taskId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: safeLimit,
  })
  const rows = [...latestRows].reverse()
  const replayRows = rows.filter((row) => shouldReplayTaskRow(row.eventType))
  return await mapRowsToReplayEvents(replayRows)
}

export function getProjectChannel(projectId: string) {
  return `${CHANNEL_PREFIX}${projectId}`
}

async function mirrorTaskEventToRun(message: SSEEvent) {
  const runEvents = mapTaskSSEEventToRunEvents(message)
  if (runEvents.length === 0) return
  for (const event of runEvents) {
    await publishRunEvent(event)
  }
}

export async function publishTaskLifecycleEvent(params: {
  taskId: string
  projectId: string
  userId: string
  lifecycleType: TaskEventType
  taskType?: string | null
  targetType?: string | null
  targetId?: string | null
  episodeId?: string | null
  payload?: Record<string, unknown> | null
  persist?: boolean
}) {
  const normalizedType = normalizeLifecycleType(params.lifecycleType)
  const seq = await resolveNextEventSeq(params.taskId)
  const event = await taskEventModel.create({
    data: {
      taskId: params.taskId,
      projectId: params.projectId,
      userId: params.userId,
      seq,
      eventType: normalizedType,
      payload: normalizeLifecyclePayload(params.lifecycleType, params.taskType, params.payload || null),
    },
  })
  const ts = event.createdAt.toISOString()
  const id = String(event.id)

  const message = buildLifecycleEvent({
    id,
    ts,
    lifecycleType: params.lifecycleType,
    taskId: params.taskId,
    projectId: params.projectId,
    userId: params.userId,
    taskType: params.taskType || null,
    targetType: params.targetType || null,
    targetId: params.targetId || null,
    episodeId: params.episodeId || null,
    payload: params.payload || null,
  })

  await mirrorTaskEventToRun(message)
  return message
}

export async function publishTaskEvent(params: {
  taskId: string
  projectId: string
  userId: string
  type: TaskEventType
  taskType?: string | null
  targetType?: string | null
  targetId?: string | null
  episodeId?: string | null
  payload?: Record<string, unknown> | null
  persist?: boolean
}) {
  return await publishTaskLifecycleEvent({
    taskId: params.taskId,
    projectId: params.projectId,
    userId: params.userId,
    lifecycleType: params.type,
    taskType: params.taskType,
    targetType: params.targetType,
    targetId: params.targetId,
    episodeId: params.episodeId,
    payload: params.payload,
    persist: params.persist,
  })
}

export async function publishTaskStreamEvent(params: {
  taskId: string
  projectId: string
  userId: string
  taskType?: string | null
  targetType?: string | null
  targetId?: string | null
  episodeId?: string | null
  payload?: Record<string, unknown> | null
  persist?: boolean
}) {
  if (!STREAM_EPHEMERAL_ENABLED) return null

  const normalizedPayload = normalizeStreamPayload(params.taskType, params.payload || null)
  const seq = await resolveNextEventSeq(params.taskId)
  const event = await taskEventModel.create({
    data: {
      taskId: params.taskId,
      projectId: params.projectId,
      userId: params.userId,
      seq,
      eventType: TASK_SSE_EVENT_TYPE.STREAM,
      payload: normalizedPayload,
    },
  })
  const ts = event.createdAt.toISOString()
  const id = String(event.id)

  const message = buildStreamEvent({
    id,
    ts,
    taskId: params.taskId,
    projectId: params.projectId,
    userId: params.userId,
    taskType: params.taskType || null,
    targetType: params.targetType || null,
    targetId: params.targetId || null,
    episodeId: params.episodeId || null,
    payload: normalizedPayload,
  })

  await mirrorTaskEventToRun(message)
  return message
}

export async function listEventsAfter(projectId: string, afterId: string | null, limit = 200) {
  const pageSize = Math.max(limit * 2, 400)
  const maxScanRows = Math.max(limit * 50, 20_000)
  const initialCursor = typeof afterId === 'string' && afterId.trim() ? afterId.trim() : null
  let cursorId: string | null = initialCursor
  let cursorCreatedAt: Date | null = null

  if (cursorId) {
    const anchor = await taskEventModel.findFirst({
      where: {
        projectId,
        id: cursorId,
      },
      select: {
        id: true,
        createdAt: true,
      },
    })
    if (anchor) {
      cursorId = anchor.id
      cursorCreatedAt = anchor.createdAt
    } else {
      cursorId = null
      cursorCreatedAt = null
    }
  }

  let scannedRows = 0
  const collected: TaskEventRow[] = []

  while (collected.length < limit && scannedRows < maxScanRows) {
    const rows = await taskEventModel.findMany({
      where: {
        projectId,
        ...(cursorId && cursorCreatedAt
          ? {
              OR: [
                { createdAt: { gt: cursorCreatedAt } },
                {
                  AND: [
                    { createdAt: cursorCreatedAt },
                    { id: { gt: cursorId } },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: pageSize,
    })

    if (rows.length === 0) break
    scannedRows += rows.length

    for (const row of rows) {
      if (!shouldReplayTaskRow(row.eventType)) continue
      collected.push(row)
      if (collected.length >= limit) break
    }

    const last = rows[rows.length - 1]
    if (last) {
      cursorId = last.id
      cursorCreatedAt = last.createdAt
    }
    if (rows.length < pageSize) break
  }

  return await mapRowsToReplayEvents(collected.slice(0, limit))
}
