/**
 * 批量创建剧集 API
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

interface BatchEpisode {
    name: string
    description?: string
    novelText: string
}

export const POST = apiHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await params

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult
    const { episodes, clearExisting = false, importStatus } = await request.json()

    if (!episodes || !Array.isArray(episodes)) {
        throw new ApiError('INVALID_PARAMS')
    }

    // 验证项目存在
    const project = await prisma.novelPromotionProject.findFirst({
        where: { projectId }
    })

    if (!project) {
        throw new ApiError('NOT_FOUND')
    }

    // 如果需要清空现有剧集
    if (clearExisting) {
        await prisma.novelPromotionEpisode.deleteMany({
            where: { novelPromotionProjectId: project.id }
        })
    }

    // 如果剧集数组为空，只更新 importStatus
    if (episodes.length === 0) {
        if (importStatus) {
            await prisma.novelPromotionProject.update({
                where: { id: project.id },
                data: { importStatus }
            })
        }
        return NextResponse.json({
            success: true,
            episodes: [],
            message: '已清空剧集'
        })
    }

    // 获取当前最大剧集编号
    const lastEpisode = await prisma.novelPromotionEpisode.findFirst({
        where: { novelPromotionProjectId: project.id },
        orderBy: { episodeNumber: 'desc' }
    })

    const startNumber = clearExisting ? 1 : (lastEpisode?.episodeNumber || 0) + 1

    // 批量创建剧集
    const createdEpisodes = await prisma.$transaction(
        (episodes as BatchEpisode[]).map((ep, idx) =>
            prisma.novelPromotionEpisode.create({
                data: {
                    novelPromotionProjectId: project.id,
                    episodeNumber: startNumber + idx,
                    name: ep.name,
                    description: ep.description || null,
                    novelText: ep.novelText
                }
            })
        )
    )

    // 更新项目的 lastEpisodeId 和 importStatus
    const updateData: { lastEpisodeId: string; importStatus?: string } = { lastEpisodeId: createdEpisodes[0].id }
    if (importStatus) {
        updateData.importStatus = importStatus
    }

    await prisma.novelPromotionProject.update({
        where: { id: project.id },
        data: updateData
    })

    return NextResponse.json({
        success: true,
        episodes: createdEpisodes.map(ep => ({
            id: ep.id,
            episodeNumber: ep.episodeNumber,
            name: ep.name
        }))
    })
})
