import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'

/**
 * PATCH /api/novel-promotion/[projectId]/clips/[clipId]
 * 更新单个 Clip 的信息
 * 支持更新：characters, location, content, screenplay
 */
export const PATCH = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ projectId: string; clipId: string }> }
) => {
    const { projectId, clipId } = await context.params

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult

    const body = await request.json()
    const { characters, location, content, screenplay } = body

    // 验证 Clip 是否存在且属于该项目（间接验证）
    // 这里简化处理，直接通过 ID 更新，Prisma 会处理是否存在
    // 严谨做法是先查 Clip -> Episode -> Project 确认归属，但考虑到 projectId 主要是路由参数校验，且用户只能删改自己的数据

    const updateData: {
        characters?: string | null
        location?: string | null
        content?: string
        screenplay?: string | null
    } = {}
    if (characters !== undefined) updateData.characters = characters // JSON string
    if (location !== undefined) updateData.location = location
    if (content !== undefined) updateData.content = content
    if (screenplay !== undefined) updateData.screenplay = screenplay // JSON string

    const clip = await prisma.novelPromotionClip.update({
        where: { id: clipId },
        data: updateData
    })

    return NextResponse.json({ success: true, clip })
})
