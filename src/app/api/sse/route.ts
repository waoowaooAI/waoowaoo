import { createScopedLogger } from '@/lib/logging/core'
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'
import { isErrorResponse, requireProjectAuthLight, requireUserAuth } from '@/lib/api-auth'
import type { SSEEvent } from '@/lib/task/types'
import { getSharedSubscriber } from '@/lib/sse/shared-subscriber'

function formatSSE(event: SSEEvent) {
  const dataLine = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
  if (typeof event.id === 'string' && event.id.length > 0) {
    return `id: ${event.id}\n${dataLine}`
  }
  return dataLine
}

function formatHeartbeat() {
  return `event: heartbeat\ndata: {"ts":"${new Date().toISOString()}"}\n\n`
}

function isSSEEventLike(value: unknown): value is SSEEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (
    typeof record.id !== 'string'
    || typeof record.type !== 'string'
    || typeof record.projectId !== 'string'
    || typeof record.userId !== 'string'
    || typeof record.ts !== 'string'
  ) return false
  if (record.type === 'mutation.batch') {
    return typeof record.mutationBatchId === 'string' && Array.isArray(record.targets)
  }
  return typeof record.taskId === 'string'
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

  const sharedSubscriber = getSharedSubscriber()
  const requestId = getRequestId(request)
  const encoder = new TextEncoder()
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
          lastEventId: request.headers.get('last-event-id') || '0'}})

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

      const bootstrap = await executeProjectAgentOperationFromApi({
        request,
        operationId: 'get_sse_bootstrap',
        projectId,
        userId: session.user.id,
        input: {
          episodeId: episodeId || null,
          lastEventId: request.headers.get('last-event-id'),
        },
        source: 'project-ui',
      })

      const channel = (bootstrap && typeof bootstrap === 'object' && !Array.isArray(bootstrap) && typeof (bootstrap as { channel?: unknown }).channel === 'string')
        ? (bootstrap as { channel: string }).channel
        : ''
      const events = (bootstrap && typeof bootstrap === 'object' && !Array.isArray(bootstrap) && Array.isArray((bootstrap as { events?: unknown }).events))
        ? (bootstrap as { events: SSEEvent[] }).events
        : []
      const mode = (bootstrap && typeof bootstrap === 'object' && !Array.isArray(bootstrap) && typeof (bootstrap as { mode?: unknown }).mode === 'string')
        ? (bootstrap as { mode: string }).mode
        : 'unknown'

      if (!channel) {
        throw new ApiError('EXTERNAL_ERROR', {
          code: 'SSE_BOOTSTRAP_INVALID',
          message: 'get_sse_bootstrap missing channel',
        })
      }

      logger.info({
        action: mode === 'replay' ? 'sse.replay' : 'sse.active_snapshot',
        message: 'sse bootstrap sent',
        details: { mode, count: events.length },
      })

      for (const event of events) {
        safeEnqueue(formatSSE(event))
      }

      unsubscribe = await sharedSubscriber.addChannelListener(channel, (message) => {
        try {
          const payload = JSON.parse(message) as unknown
          if (!isSSEEventLike(payload)) {
            logger.error({
              action: 'sse.message.invalid',
              message: 'invalid sse message payload',
              details: { message },
            })
            return
          }
          if (payload.userId !== session.user.id) {
            logger.error({
              action: 'sse.message.user_mismatch',
              message: 'sse message userId mismatch',
              details: { eventUserId: payload.userId, sessionUserId: session.user.id },
            })
            return
          }
          safeEnqueue(formatSSE(payload))
        } catch {
          logger.error({
            action: 'sse.message.invalid',
            message: 'invalid sse message json',
            details: { message },
          })
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
