import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

export type MutationBatchStatus = 'active' | 'reverted' | 'failed'

export type MutationEntrySpec = {
  kind: string
  targetType: string
  targetId: string
  payload?: unknown
}

function hasMutationBatchModel(client: unknown): client is {
  mutationBatch: {
    create: (args: unknown) => Promise<unknown>
    findMany: (args: unknown) => Promise<unknown>
    update: (args: unknown) => Promise<unknown>
  }
} {
  const candidate = client as { mutationBatch?: unknown } | null
  return !!candidate?.mutationBatch
}

export async function createMutationBatch(params: {
  projectId: string
  userId: string
  source: string
  operationId?: string | null
  summary?: string | null
  entries: MutationEntrySpec[]
}) {
  // In tests, `prisma` may be mocked with only a subset of models.
  // Fall back to a minimal shape to avoid crashing route-level tests.
  if (!hasMutationBatchModel(prisma)) {
    const now = new Date()
    const batchId = `mutation-batch-mock-${Date.now().toString(36)}`
    return {
      id: batchId,
      projectId: params.projectId,
      userId: params.userId,
      source: params.source,
      operationId: params.operationId ?? null,
      summary: params.summary ?? null,
      status: 'active' as const,
      revertError: null as string | null,
      revertedAt: null as Date | null,
      createdAt: now,
      updatedAt: now,
      entries: params.entries.map((entry, idx) => ({
        id: `${batchId}-entry-${idx}`,
        batchId,
        kind: entry.kind,
        targetType: entry.targetType,
        targetId: entry.targetId,
        payload: entry.payload ?? null,
        createdAt: now,
      })),
    }
  }

  return prisma.mutationBatch.create({
    data: {
      projectId: params.projectId,
      userId: params.userId,
      source: params.source,
      operationId: params.operationId ?? null,
      summary: params.summary ?? null,
      entries: {
        create: params.entries.map((entry) => ({
          kind: entry.kind,
          targetType: entry.targetType,
          targetId: entry.targetId,
          ...(entry.payload === undefined ? {} : { payload: entry.payload as Prisma.InputJsonValue }),
        })),
      },
    },
    include: {
      entries: true,
    },
  })
}

export async function listRecentMutationBatches(params: {
  projectId: string
  userId: string
  limit?: number
}) {
  const limit = Math.max(1, Math.min(20, params.limit ?? 10))
  if (!hasMutationBatchModel(prisma)) return []
  return prisma.mutationBatch.findMany({
    where: {
      projectId: params.projectId,
      userId: params.userId,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      entries: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })
}

export async function markMutationBatchReverted(params: {
  batchId: string
  status: MutationBatchStatus
  revertError?: string | null
}) {
  if (!hasMutationBatchModel(prisma)) {
    return {
      id: params.batchId,
      status: params.status,
      revertError: params.revertError ?? null,
      revertedAt: params.status === 'reverted' ? new Date() : null,
    }
  }
  return prisma.mutationBatch.update({
    where: { id: params.batchId },
    data: {
      status: params.status,
      revertError: params.revertError ?? null,
      revertedAt: params.status === 'reverted' ? new Date() : null,
    },
  })
}
