import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { createScopedLogger } from '@/lib/logging/core'
import { prisma } from '@/lib/prisma'

type StatusCount = {
  status: string
  count: number
}

type TypeStatusCount = {
  type: string
  status: string
  count: number
}

export const GET = apiHandler(async () => {
  const startedAt = Date.now()
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const logger = createScopedLogger({
    module: 'ops.queue.summary',
    action: 'ops.queue.summary.get',
    userId: authResult.session.user.id,
  })

  const [statusRows, typeRows, recentFailed] = await Promise.all([
    prisma.$queryRaw<StatusCount[]>`
      SELECT status, COUNT(*)::int AS count
      FROM ivm_task
      GROUP BY status
    `,
    prisma.$queryRaw<TypeStatusCount[]>`
      SELECT type, status, COUNT(*)::int AS count
      FROM ivm_task
      GROUP BY type, status
    `,
    prisma.task.findMany({
      where: {
        status: 'failed',
      },
      orderBy: {
        queuedAt: 'desc',
      },
      take: 20,
      select: {
        id: true,
        type: true,
        status: true,
        errorCode: true,
        errorMessage: true,
        queuedAt: true,
      },
    }),
  ])

  const totals = statusRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = row.count
    return acc
  }, {})

  const byType = typeRows.reduce<Record<string, Record<string, number>>>((acc, row) => {
    const current = acc[row.type] || {}
    current[row.status] = row.count
    acc[row.type] = current
    return acc
  }, {})

  const totalTasks = Object.values(totals).reduce((sum, count) => sum + count, 0)
  logger.info({
    action: 'ops.queue.summary.generated',
    message: 'queue summary generated',
    durationMs: Date.now() - startedAt,
    details: {
      totalTasks,
      statusBuckets: Object.keys(totals).length,
      typeBuckets: Object.keys(byType).length,
      recentFailedCount: recentFailed.length,
    },
  })

  return NextResponse.json({
    ok: true,
    totals,
    byType,
    recentFailed,
    generatedAt: new Date().toISOString(),
  })
})
