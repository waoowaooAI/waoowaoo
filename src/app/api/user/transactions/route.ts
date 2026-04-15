import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { BILLING_CURRENCY } from '@/lib/billing/currency'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import type { Prisma } from '@prisma/client'
import { toMoneyNumber } from '@/lib/billing/money'

// action key 的特征：小写字母、数字、下划线组成
const ACTION_KEY_PATTERN = /^[a-z][a-z0-9_]*$/

/**
 * 从 BalanceTransaction.description 中解析出 action key
 * 支持的格式：
 *   "[SHADOW] modify_asset_image - gemini-compatible:... - ¥0.96"
 *   "modify_asset_image - gemini-compatible:... - ¥0.96"
 * 返回 action key（如 "modify_asset_image"），解析失败返回 null
 */
function extractActionFromDescription(description: string | null): string | null {
    if (!description) return null
    const cleaned = description.replace(/^\[SHADOW\]\s*/i, '').trim()
    const firstPart = cleaned.split(' - ')[0].trim()
    if (ACTION_KEY_PATTERN.test(firstPart)) return firstPart
    return null
}

/**
 * GET /api/user/transactions
 * 获取用户余额流水记录
 */
export const GET = apiHandler(async (request: NextRequest) => {
    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const type = searchParams.get('type') // recharge | consume | all
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const where: Prisma.BalanceTransactionWhereInput = { userId: session.user.id }
    if (type && type !== 'all') {
        where.type = type
    }

    // 日期筛选
    if (startDate || endDate) {
        where.createdAt = {}
        if (startDate) {
            where.createdAt.gte = new Date(startDate)
        }
        if (endDate) {
            // 包含结束日期的整天
            const endDateTime = new Date(endDate)
            endDateTime.setHours(23, 59, 59, 999)
            where.createdAt.lte = endDateTime
        }
    }

    // 获取流水记录
    const [transactionsRaw, total] = await Promise.all([
        prisma.balanceTransaction.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize
        }),
        prisma.balanceTransaction.count({ where })
    ])

    // 批量查询涉及的项目名和集数（避免 N+1）
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
        // 解析 billingMeta JSON
        let billingMeta: Record<string, unknown> | null = null
        if (item.billingMeta && typeof item.billingMeta === 'string') {
            try {
                billingMeta = JSON.parse(item.billingMeta) as Record<string, unknown>
            } catch { /* ignore */ }
        }

        return {
            ...item,
            amount: toMoneyNumber(item.amount),
            balanceAfter: toMoneyNumber(item.balanceAfter),
            // 优先用新字段 taskType，其次从 description 解析，供前端做 i18n 翻译
            action: item.taskType ?? extractActionFromDescription(item.description),
            // 项目名（新记录有 projectId 时有值，老记录为 null）
            projectName: item.projectId ? (projectMap.get(item.projectId) ?? null) : null,
            // 集数（新记录有 episodeId 时有值）
            episodeNumber: item.episodeId ? (episodeMap.get(item.episodeId)?.episodeNumber ?? null) : null,
            episodeName: item.episodeId ? (episodeMap.get(item.episodeId)?.name ?? null) : null,
            // 结构化计费详情
            billingMeta,
        }
    })

    return NextResponse.json({
        currency: BILLING_CURRENCY,
        transactions,
        pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize)
        }
    })
})
