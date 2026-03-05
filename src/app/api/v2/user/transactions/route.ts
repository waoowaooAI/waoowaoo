import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { apiHandler } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { BILLING_CURRENCY } from '@/lib/billing/currency'
import { toMoneyNumber } from '@/lib/billing/money'
import { prisma } from '@/lib/prisma'

const ACTION_KEY_PATTERN = /^[a-z][a-z0-9_]*$/

function extractActionFromDescription(description: string | null): string | null {
  if (!description) return null
  const cleaned = description.replace(/^\[SHADOW\]\s*/i, '').trim()
  const firstPart = cleaned.split(' - ')[0].trim()
  if (ACTION_KEY_PATTERN.test(firstPart)) return firstPart
  return null
}

function parsePageParam(value: string | null, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.floor(parsed)
}

function normalizeBillingMeta(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
      return parsed as Record<string, unknown>
    } catch {
      return null
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  return null
}

export const GET = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const page = parsePageParam(request.nextUrl.searchParams.get('page'), 1)
  const pageSize = Math.min(100, parsePageParam(request.nextUrl.searchParams.get('pageSize'), 20))
  const type = request.nextUrl.searchParams.get('type')
  const startDate = request.nextUrl.searchParams.get('startDate')
  const endDate = request.nextUrl.searchParams.get('endDate')

  const where: Prisma.BalanceTransactionWhereInput = {
    userId: session.user.id,
  }
  if (type && type !== 'all') {
    where.type = type
  }
  if (startDate || endDate) {
    where.createdAt = {}
    if (startDate) {
      where.createdAt.gte = new Date(startDate)
    }
    if (endDate) {
      const endDateTime = new Date(endDate)
      endDateTime.setHours(23, 59, 59, 999)
      where.createdAt.lte = endDateTime
    }
  }

  const [transactionsRaw, total] = await Promise.all([
    prisma.balanceTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.balanceTransaction.count({ where }),
  ])

  const projectIds = [...new Set(transactionsRaw.map((row) => row.projectId).filter(Boolean) as string[])]
  const episodeIds = [...new Set(transactionsRaw.map((row) => row.episodeId).filter(Boolean) as string[])]
  const [projects, episodes] = await Promise.all([
    projectIds.length > 0
      ? prisma.project.findMany({
        where: { id: { in: projectIds } },
        select: { id: true, name: true },
      })
      : Promise.resolve([]),
    episodeIds.length > 0
      ? prisma.episode.findMany({
        where: { id: { in: episodeIds } },
        select: { id: true, episodeIndex: true, name: true },
      })
      : Promise.resolve([]),
  ])

  const projectNameById = new Map(projects.map((project) => [project.id, project.name]))
  const episodeById = new Map(episodes.map((episode) => [episode.id, episode]))

  const transactions = transactionsRaw.map((row) => {
    const episode = row.episodeId ? episodeById.get(row.episodeId) : undefined
    return {
      id: row.id,
      type: row.type,
      amount: toMoneyNumber(row.amount),
      balanceAfter: toMoneyNumber(row.balanceAfter),
      description: row.description,
      action: row.taskType || extractActionFromDescription(row.description),
      projectName: row.projectId ? (projectNameById.get(row.projectId) || null) : null,
      episodeNumber: episode ? episode.episodeIndex + 1 : null,
      episodeName: episode?.name || null,
      billingMeta: normalizeBillingMeta(row.billingMeta),
      createdAt: row.createdAt,
    }
  })

  return NextResponse.json({
    ok: true,
    currency: BILLING_CURRENCY,
    transactions,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  })
})
