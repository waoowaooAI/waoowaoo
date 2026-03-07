import { logInfo as _ulogInfo } from '@/lib/logging/core'
/**
 * 标识符分集 API
 * 根据检测到的分集标记直接切割文本，不调用 AI
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logUserAction } from '@/lib/logging/semantic'
import { detectEpisodeMarkers, splitByMarkers } from '@/lib/episode-marker-detector'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

export const POST = apiHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) => {
    _ulogInfo('[Split-By-Markers API] ========== 开始处理请求 ==========')

    const { projectId } = await params

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult
    const session = authResult.session

    const userId = session.user.id
    const username = session.user.name || session.user.email || 'unknown'
    const { content } = await request.json()

    if (!content || typeof content !== 'string') {
        throw new ApiError('INVALID_PARAMS')
    }

    if (content.length < 100) {
        throw new ApiError('INVALID_PARAMS')
    }

    // 验证项目存在
    const project = await prisma.novelPromotionProject.findFirst({
        where: { projectId },
        include: { project: true }
    })

    if (!project) {
        throw new ApiError('NOT_FOUND')
    }

    const projectName = project.project?.name || projectId

    // 执行分集标记检测
    const markerResult = detectEpisodeMarkers(content)

    if (!markerResult.hasMarkers || markerResult.matches.length < 2) {
        throw new ApiError('INVALID_PARAMS')
    }

    // 根据标记分割内容
    const episodes = splitByMarkers(content, markerResult)

    // 记录日志
    logUserAction(
        'EPISODE_SPLIT_BY_MARKERS',
        userId,
        username,
        `标识符分集完成 - ${episodes.length} 集，标记类型: ${markerResult.markerType}`,
        {
            markerType: markerResult.markerType,
            confidence: markerResult.confidence,
            episodeCount: episodes.length,
            totalWords: episodes.reduce((sum, ep) => sum + ep.wordCount, 0)
        },
        projectId,
        projectName
    )

    return NextResponse.json({
        success: true,
        method: 'markers',
        markerType: markerResult.markerType,
        episodes
    })
})
