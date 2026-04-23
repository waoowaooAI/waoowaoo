import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'
import { BILLING_CURRENCY } from '@/lib/billing/currency'
import { toMoneyNumber } from '@/lib/billing/money'
import { getUserCostSummary } from '@/lib/billing'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'

const ACTION_KEY_PATTERN = /^[a-z][a-z0-9_]*$/

function readNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function extractActionFromDescription(description: string | null): string | null {
  if (!description) return null
  const cleaned = description.replace(/^\[SHADOW\]\s*/i, '').trim()
  const firstPart = cleaned.split(' - ')[0]?.trim() || ''
  if (ACTION_KEY_PATTERN.test(firstPart)) return firstPart
  return null
}

function parseDateField(value: unknown, field: string): Date | null {
  const raw = readString(value)
  if (!raw) return null
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'DATE_INVALID',
      field,
    })
  }
  return date
}

export function createUserBillingOperations(): ProjectAgentOperationRegistryDraft {
  return {
    list_user_transactions: {
      id: 'list_user_transactions',
      summary: 'List balance transactions for the current user with filters and pagination.',
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
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const params = (input && typeof input === 'object' && !Array.isArray(input)) ? input as Record<string, unknown> : {}

        const page = Math.max(1, readNumber(params.page, 1))
        const pageSize = Math.min(200, Math.max(1, readNumber(params.pageSize, 20)))
        const type = readString(params.type)
        const startDate = parseDateField(params.startDate, 'startDate')
        const endDate = parseDateField(params.endDate, 'endDate')

        const where: Prisma.BalanceTransactionWhereInput = { userId: ctx.userId }
        if (type && type !== 'all') {
          where.type = type
        }

        if (startDate || endDate) {
          where.createdAt = {}
          if (startDate) {
            where.createdAt.gte = startDate
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

        const projectIds = [...new Set(transactionsRaw.map((t) => t.projectId).filter(Boolean) as string[])]
        const episodeIds = [...new Set(transactionsRaw.map((t) => t.episodeId).filter(Boolean) as string[])]

        const [projects, episodes] = await Promise.all([
          projectIds.length > 0
            ? prisma.project.findMany({
              where: { id: { in: projectIds } },
              select: { id: true, name: true },
            })
            : Promise.resolve([]),
          episodeIds.length > 0
            ? prisma.projectEpisode.findMany({
              where: { id: { in: episodeIds } },
              select: { id: true, episodeNumber: true, name: true },
            })
            : Promise.resolve([]),
        ])

        const projectMap = new Map(projects.map((p) => [p.id, p.name]))
        const episodeMap = new Map(episodes.map((e) => [e.id, { episodeNumber: e.episodeNumber, name: e.name }]))

        const transactions = transactionsRaw.map((item) => {
          let billingMeta: Record<string, unknown> | null = null
          if (item.billingMeta && typeof item.billingMeta === 'string') {
            try {
              billingMeta = JSON.parse(item.billingMeta) as Record<string, unknown>
            } catch {
              billingMeta = null
            }
          }

          return {
            ...item,
            amount: toMoneyNumber(item.amount),
            balanceAfter: toMoneyNumber(item.balanceAfter),
            action: item.taskType ?? extractActionFromDescription(item.description),
            projectName: item.projectId ? (projectMap.get(item.projectId) ?? null) : null,
            episodeNumber: item.episodeId ? (episodeMap.get(item.episodeId)?.episodeNumber ?? null) : null,
            episodeName: item.episodeId ? (episodeMap.get(item.episodeId)?.name ?? null) : null,
            billingMeta,
          }
        })

        return {
          currency: BILLING_CURRENCY,
          transactions,
          pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize),
          },
        }
      },
    },

    get_user_costs: {
      id: 'get_user_costs',
      summary: 'Get current user cost summary by project.',
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
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx) => {
        const costSummary = await getUserCostSummary(ctx.userId)

        const projectIds = costSummary.byProject.map((p) => p.projectId)
        const projects = projectIds.length > 0
          ? await prisma.project.findMany({
            where: { id: { in: projectIds } },
            select: { id: true, name: true },
          })
          : []

        const projectMap = new Map(projects.map((p) => [p.id, p.name]))

        const byProjectWithNames = costSummary.byProject.map((p) => ({
          projectId: p.projectId,
          projectName: projectMap.get(p.projectId) || '未知项目',
          totalCost: p._sum.cost || 0,
          recordCount: p._count,
        }))

        return {
          userId: ctx.userId,
          currency: BILLING_CURRENCY,
          total: costSummary.total,
          byProject: byProjectWithNames.sort((a, b) => b.totalCost - a.totalCost),
        }
      },
    },
  }
}
