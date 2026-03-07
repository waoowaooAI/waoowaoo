import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * GET /api/novel-promotion/[projectId]/editor
 * 获取剧集的编辑器项目数据
 */
export const GET = apiHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await params

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult

    const episodeId = request.nextUrl.searchParams.get('episodeId')

    if (!episodeId) {
        throw new ApiError('INVALID_PARAMS')
    }

    // 查找编辑器项目
    const editorProject = await prisma.videoEditorProject.findUnique({
        where: { episodeId }
    })

    if (!editorProject) {
        return NextResponse.json({ projectData: null }, { status: 200 })
    }

    return NextResponse.json({
        id: editorProject.id,
        episodeId: editorProject.episodeId,
        projectData: JSON.parse(editorProject.projectData),
        renderStatus: editorProject.renderStatus,
        outputUrl: editorProject.outputUrl,
        updatedAt: editorProject.updatedAt
    })
})

/**
 * PUT /api/novel-promotion/[projectId]/editor
 * 保存编辑器项目数据
 */
export const PUT = apiHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await params

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult

    const body = await request.json()
    const { episodeId, projectData } = body

    if (!episodeId || !projectData) {
        throw new ApiError('INVALID_PARAMS')
    }

    // 验证剧集存在
    const episode = await prisma.novelPromotionEpisode.findFirst({
        where: {
            id: episodeId,
            novelPromotionProject: { projectId }
        }
    })

    if (!episode) {
        throw new ApiError('NOT_FOUND')
    }

    // 保存或更新编辑器项目
    const editorProject = await prisma.videoEditorProject.upsert({
        where: { episodeId },
        create: {
            episodeId,
            projectData: JSON.stringify(projectData)
        },
        update: {
            projectData: JSON.stringify(projectData),
            updatedAt: new Date()
        }
    })

    return NextResponse.json({
        success: true,
        id: editorProject.id,
        updatedAt: editorProject.updatedAt
    })
})

/**
 * DELETE /api/novel-promotion/[projectId]/editor
 * 删除编辑器项目
 */
export const DELETE = apiHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await params

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult

    const episodeId = request.nextUrl.searchParams.get('episodeId')

    if (!episodeId) {
        throw new ApiError('INVALID_PARAMS')
    }

    await prisma.videoEditorProject.delete({
        where: { episodeId }
    })

    return NextResponse.json({ success: true })
})
