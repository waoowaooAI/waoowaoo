import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { ApiError, apiHandler } from '@/lib/api-errors'

// 获取单个场景
export const GET = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ locationId: string }> }
) => {
    const { locationId } = await context.params

    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const location = await prisma.globalLocation.findUnique({
        where: { id: locationId },
        include: { images: true }
    })

    if (!location || location.userId !== session.user.id) {
        throw new ApiError('NOT_FOUND')
    }

    return NextResponse.json({ location })
})

// 更新场景
export const PATCH = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ locationId: string }> }
) => {
    const { locationId } = await context.params

    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const location = await prisma.globalLocation.findUnique({
        where: { id: locationId }
    })

    if (!location || location.userId !== session.user.id) {
        throw new ApiError('FORBIDDEN')
    }

    const body = await request.json()
    const { name, summary, folderId } = body

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name.trim()
    if (summary !== undefined) updateData.summary = summary?.trim() || null
    if (folderId !== undefined) {
        if (folderId) {
            const folder = await prisma.globalAssetFolder.findUnique({
                where: { id: folderId }
            })
            if (!folder || folder.userId !== session.user.id) {
                throw new ApiError('INVALID_PARAMS')
            }
        }
        updateData.folderId = folderId || null
    }

    const updatedLocation = await prisma.globalLocation.update({
        where: { id: locationId },
        data: updateData,
        include: { images: true }
    })

    return NextResponse.json({ success: true, location: updatedLocation })
})

// 删除场景
export const DELETE = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ locationId: string }> }
) => {
    const { locationId } = await context.params

    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const location = await prisma.globalLocation.findUnique({
        where: { id: locationId }
    })

    if (!location || location.userId !== session.user.id) {
        throw new ApiError('FORBIDDEN')
    }

    await prisma.globalLocation.delete({
        where: { id: locationId }
    })

    return NextResponse.json({ success: true })
})
