import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * PUT /api/novel-promotion/[projectId]/photography-plan
 * 更新分镜组的摄影方案
 */
export const PUT = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await context.params

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult

    const body = await request.json()
    const { storyboardId, photographyPlan } = body

    if (!storyboardId) {
        throw new ApiError('INVALID_PARAMS')
    }

    // 验证 storyboard 存在
    const storyboard = await prisma.novelPromotionStoryboard.findUnique({
        where: { id: storyboardId }
    })

    if (!storyboard) {
        throw new ApiError('NOT_FOUND')
    }

    // 更新摄影方案
    const photographyPlanJson = photographyPlan ? JSON.stringify(photographyPlan) : null

    await prisma.novelPromotionStoryboard.update({
        where: { id: storyboardId },
        data: { photographyPlan: photographyPlanJson }
    })

    _ulogInfo('[PUT /photography-plan] 更新成功, storyboardId:', storyboardId)

    return NextResponse.json({ success: true })
})
