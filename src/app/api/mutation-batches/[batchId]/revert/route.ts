import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { forbidden, notFound, requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { revertMutationBatch } from '@/lib/mutation-batch/revert'

export const POST = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ batchId: string }> },
) => {
  const { batchId } = await context.params
  const session = await requireAuth()
  const resolvedBatchId = batchId.trim()
  if (!resolvedBatchId) return notFound('MutationBatch')

  const batch = await prisma.mutationBatch.findUnique({
    where: { id: resolvedBatchId },
    select: { id: true, projectId: true, userId: true, status: true },
  })
  if (!batch) return notFound('MutationBatch')
  if (batch.userId !== session.user.id) return forbidden('Forbidden')

  const result = await revertMutationBatch({
    batchId: batch.id,
    projectId: batch.projectId,
    userId: session.user.id,
  })

  return NextResponse.json({
    ok: result.ok,
    reverted: result.reverted,
    ...(result.ok ? {} : { error: result.error }),
  })
})
