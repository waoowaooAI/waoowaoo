import { createScopedLogger } from '@/lib/logging/core'
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { getProjectChannel, listEventsAfter } from '@/lib/task/publisher'
import { isErrorResponse, requireProjectAuthLight, requireUserAuth } from '@/lib/api-auth'
import { TASK_EVENT_TYPE, TASK_SSE_EVENT_TYPE, type SSEEvent } from '@/lib/task/types'
import { getSharedSubscriber } from '@/lib/sse/shared-subscriber'
import { prisma } from '@/lib/prisma'
import { coerceTaskIntent } from '@/lib/task/intent'

function parseReplayCursorId(value: string | null): number {
  if (!value) return 0
  const trimmed = value.trim()
  if (!trimmed || !/^\d+$/.test(trimmed)) return 0
  const parsed = Number.parseInt(trimmed, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function formatSSE(event: SSEEvent) {
  const dataLine = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
  if (typeof event.id === 'string' && /^\d+$/.test(event.id)) {
    return `id: ${event.id}\n${dataLine}`
  }
  return dataLine
}

function formatHeartbeat() {
  return `event: heartbeat\ndata: {"ts":"${new Date().toISOString()}"}\n\n`
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

async function listActiveLifecycleSnapshot(params: {
  projectId: string
  episodeId: string | null
  userId: string
  limit?: number
}) {
  const limit = params.limit || 500
  const rows = await prisma.task.findMany({
    where: {
      projectId: params.projectId,
      userId: params.userId,
      status: {
        in: ['queued', 'processing']},
      ...(params.episodeId ? { episodeId: params.episodeId } : {})},
    orderBy: {
      updatedAt: 'desc'},
    take: limit,
    select: {
      id: true,
      type: true,
      targetType: true,
      targetId: true,
      episodeId: true,
      userId: true,
      status: true,
      progress: true,
      payload: true,
      updatedAt: true}})

  return rows.map((row): SSEEvent => {
    const payload = asObject(row.payload)
    const payloadUi = asObject(payload?.ui)
    const lifecycleType = row.status === 'queued'
      ? TASK_EVENT_TYPE.CREATED
      : TASK_EVENT_TYPE.PROCESSING
    const eventPayload: Record<string, unknown> = {
      ...(payload || {}),
      lifecycleType,
      intent: coerceTaskIntent(payloadUi?.intent ?? payload?.intent, row.type),
      progress: typeof row.progress === 'number' ? row.progress : null}

    return {
      id: `snapshot:${row.id}:${row.updatedAt.getTime()}`,
      type: TASK_SSE_EVENT_TYPE.LIFECYCLE,
      taskId: row.id,
      projectId: params.projectId,
      userId: row.userId,
      ts: row.updatedAt.toISOString(),
      taskType: row.type,
      targetType: row.targetType,
      targetId: row.targetId,
      episodeId: row.episodeId,
      payload: eventPayload}
  })
}

export const GET = apiHandler(async (request: NextRequest) => {
  const projectId = request.nextUrl.searchParams.get('projectId')
  const episodeId = request.nextUrl.searchParams.get('episodeId')
  if (!projectId) {
    throw new ApiError('INVALID_PARAMS')
  }

  const authResult = projectId === 'global-asset-hub'
    ? await requireUserAuth()
    : await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const channel = getProjectChannel(projectId)
  const sharedSubscriber = getSharedSubscriber()
  const requestId = getRequestId(request)
  const encoder = new TextEncoder()
  const lastEventId = parseReplayCursorId(request.headers.get('last-event-id'))
  const signal = request.signal
  let closeStream: (() => Promise<void>) | null = null

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      let timer: ReturnType<typeof setInterval> | null = null
      let unsubscribe: (() => Promise<void>) | null = null
      const logger = createScopedLogger({
        module: 'sse',
        action: 'sse.stream',
        requestId: requestId || undefined,
        projectId,
        userId: session.user.id})
      logger.info({
        action: 'sse.connect',
        message: 'sse connection established',
        details: {
          lastEventId: lastEventId || 0}})

      const safeEnqueue = (chunk: string) => {
        if (closed) return
        controller.enqueue(encoder.encode(chunk))
      }

      const close = async () => {
        if (closed) return
        closed = true
        try {
          await unsubscribe?.()
        } catch {}
        logger.info({
          action: 'sse.disconnect',
          message: 'sse connection closed'})
        if (timer) {
          clearInterval(timer)
          timer = null
        }
        try {
          controller.close()
        } catch {}
      }
      closeStream = close

      signal.addEventListener('abort', () => {
        void close()
      })

      if (lastEventId > 0) {
        const missed = await listEventsAfter(projectId, lastEventId, 5000)
        logger.info({
          action: 'sse.replay',
          message: 'sse replay sent',
          details: {
            fromEventId: lastEventId,
            count: missed.length}})
        for (const event of missed) {
          safeEnqueue(formatSSE(event))
        }
      } else {
        const snapshotEvents = await listActiveLifecycleSnapshot({
          projectId,
          episodeId,
          userId: session.user.id,
          limit: 500})
        logger.info({
          action: 'sse.active_snapshot',
          message: 'sse active snapshot sent',
          details: {
            count: snapshotEvents.length}})
        for (const event of snapshotEvents) {
          safeEnqueue(formatSSE(event))
        }
      }

      unsubscribe = await sharedSubscriber.addChannelListener(channel, (message) => {
        try {
          const event = JSON.parse(message) as SSEEvent
          safeEnqueue(formatSSE(event))
        } catch {
          safeEnqueue(`data: ${message}\n\n`)
        }
      })

      timer = setInterval(() => safeEnqueue(formatHeartbeat()), 15_000)
    },
    cancel() {
      void closeStream?.()
    }})

  return new NextResponse(stream as unknown as BodyInit, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'}})
})
