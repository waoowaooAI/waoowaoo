import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'
import { listEventsAfter, getProjectChannel } from '@/lib/task/publisher'
import { TASK_EVENT_TYPE, TASK_SSE_EVENT_TYPE, TASK_STATUS, type SSEEvent } from '@/lib/task/types'
import { coerceTaskIntent } from '@/lib/task/intent'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'

function parseReplayCursorId(value: string | null | undefined): number {
  if (!value) return 0
  const trimmed = value.trim()
  if (!trimmed || !/^\d+$/.test(trimmed)) return 0
  const parsed = Number.parseInt(trimmed, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
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
}): Promise<SSEEvent[]> {
  const limit = params.limit || 500
  const rows = await prisma.task.findMany({
    where: {
      projectId: params.projectId,
      userId: params.userId,
      status: {
        in: [TASK_STATUS.QUEUED, TASK_STATUS.PROCESSING],
      },
      ...(params.episodeId ? { episodeId: params.episodeId } : {}),
    },
    orderBy: { updatedAt: 'desc' },
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
      updatedAt: true,
    },
  })

  return rows.map((row): SSEEvent => {
    const payload = asObject(row.payload)
    const payloadUi = asObject(payload?.ui)
    const lifecycleType = row.status === TASK_STATUS.QUEUED
      ? TASK_EVENT_TYPE.CREATED
      : TASK_EVENT_TYPE.PROCESSING
    const eventPayload: Record<string, unknown> = {
      ...(payload || {}),
      lifecycleType,
      intent: coerceTaskIntent(payloadUi?.intent ?? payload?.intent, row.type),
      progress: typeof row.progress === 'number' ? row.progress : null,
    }

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
      payload: eventPayload,
    }
  })
}

export function createSseOperations(): ProjectAgentOperationRegistryDraft {
  return {
    get_sse_bootstrap: defineOperation({
      id: 'get_sse_bootstrap',
      summary: 'Compute SSE bootstrap payload (replay missed events or active lifecycle snapshot).',
      intent: 'query',
      effects: {
        writes: false,
        billable: false,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: false,
        longRunning: false,
      },
      inputSchema: z.object({
        episodeId: z.string().optional().nullable(),
        lastEventId: z.string().optional().nullable(),
        replayLimit: z.number().int().positive().max(5000).optional(),
        snapshotLimit: z.number().int().positive().max(2000).optional(),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const channel = getProjectChannel(ctx.projectId)
        const lastEventId = parseReplayCursorId(input.lastEventId || null)

        if (lastEventId > 0) {
          const replayLimit = input.replayLimit ?? 5000
          const missed = await listEventsAfter(ctx.projectId, lastEventId, replayLimit)
          const events = missed.filter((event) => event.userId === ctx.userId)
          return {
            channel,
            mode: 'replay',
            fromEventId: lastEventId,
            events,
          }
        }

        const snapshotLimit = input.snapshotLimit ?? 500
        const events = await listActiveLifecycleSnapshot({
          projectId: ctx.projectId,
          episodeId: input.episodeId ? input.episodeId.trim() : null,
          userId: ctx.userId,
          limit: snapshotLimit,
        })
        return {
          channel,
          mode: 'active_snapshot',
          events,
        }
      },
    }),
  }
}
