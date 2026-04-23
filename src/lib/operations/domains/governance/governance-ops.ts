import { z } from 'zod'
import { ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { listRecentMutationBatches } from '@/lib/mutation-batch/service'
import { revertMutationBatch } from '@/lib/mutation-batch/revert'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'

export function createGovernanceOperations(): ProjectAgentOperationRegistryDraft {
  return {
    list_recent_mutation_batches: defineOperation({
      id: 'list_recent_mutation_batches',
      summary: 'List recent mutation batches that can be reverted (undo).',
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
        limit: z.number().int().positive().max(20).optional(),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const batches = await listRecentMutationBatches({
          projectId: ctx.projectId,
          userId: ctx.userId,
          limit: input.limit || 10,
        })
        return batches.map((batch) => ({
          id: batch.id,
          status: batch.status,
          source: batch.source,
          operationId: batch.operationId,
          summary: batch.summary,
          createdAt: batch.createdAt.toISOString(),
          revertedAt: batch.revertedAt ? batch.revertedAt.toISOString() : null,
          entryCount: batch.entries.length,
          entries: batch.entries.map((entry) => ({
            id: entry.id,
            kind: entry.kind,
            targetType: entry.targetType,
            targetId: entry.targetId,
            createdAt: entry.createdAt.toISOString(),
          })),
        }))
      },
    }),
    revert_mutation_batch: defineOperation({
      id: 'revert_mutation_batch',
      summary: 'Revert (undo) a mutation batch by id.',
      intent: 'act',
      effects: {
        writes: true,
        billable: false,
        destructive: true,
        overwrite: true,
        bulk: true,
        externalSideEffects: false,
        longRunning: false,
      },
      confirmation: {
        required: true,
        summary: '将撤回一次批量变更（可能删除或覆盖已有内容）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        batchId: z.string().min(1),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => revertMutationBatch({
        batchId: input.batchId,
        projectId: ctx.projectId,
        userId: ctx.userId,
      }),
    }),

    revert_mutation_batch_by_id: defineOperation({
      id: 'revert_mutation_batch_by_id',
      summary: 'Revert (undo) a mutation batch by id without requiring the caller to know its projectId.',
      intent: 'act',
      effects: {
        writes: true,
        billable: false,
        destructive: true,
        overwrite: true,
        bulk: true,
        externalSideEffects: false,
        longRunning: false,
      },
      confirmation: {
        required: true,
        summary: '将撤回一次批量变更（可能删除或覆盖已有内容）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        batchId: z.string().min(1),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const batch = await prisma.mutationBatch.findUnique({
          where: { id: input.batchId },
          select: { id: true, projectId: true, userId: true },
        })
        if (!batch) throw new ApiError('NOT_FOUND')
        if (batch.userId !== ctx.userId) throw new ApiError('FORBIDDEN')

        return await revertMutationBatch({
          batchId: batch.id,
          projectId: batch.projectId,
          userId: ctx.userId,
        })
      },
    }),
  }
}
