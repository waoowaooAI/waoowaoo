import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { attachMediaFieldsToProject } from '@/lib/media/attach'

/**
 * GET /api/projects/[projectId]/storyboards
 * 获取剧集的分镜数据（用于测试页面）
 */
export const GET = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await context.params

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult

    const { searchParams } = new URL(request.url)
    const episodeId = searchParams.get('episodeId')

    if (!episodeId) {
        throw new ApiError('INVALID_PARAMS')
    }

    // 获取剧集的分镜数据
    const storyboards = await prisma.projectStoryboard.findMany({
        where: { episodeId },
        include: {
            clip: true,
            panels: { orderBy: { panelIndex: 'asc' } }
        },
        orderBy: { createdAt: 'asc' }
    })

    const withMedia = await attachMediaFieldsToProject({ storyboards })
    const processedStoryboards = withMedia.storyboards || storyboards

    return NextResponse.json({ storyboards: processedStoryboards })
})

/**
 * PATCH /api/projects/[projectId]/storyboards
 * 清除指定 storyboard 的 lastError
 */
export const PATCH = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await context.params

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult

    const body = await request.json().catch(() => ({}))
    const storyboardId = typeof body?.storyboardId === 'string' ? body.storyboardId : ''
    if (!storyboardId) {
        throw new ApiError('INVALID_PARAMS')
    }

    await prisma.projectStoryboard.update({
        where: { id: storyboardId },
        data: { lastError: null }})

    return NextResponse.json({ success: true })
})
