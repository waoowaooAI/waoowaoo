import { logError as _ulogError } from '@/lib/logging/core'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { attachMediaFieldsToGlobalLocation } from '@/lib/media/attach'
import { resolveTaskLocale } from '@/lib/task/resolve-locale'

function toObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value as Record<string, unknown>
}

// 获取用户所有场景（支持 folderId 筛选）
export const GET = apiHandler(async (request: NextRequest) => {
    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const { searchParams } = new URL(request.url)
    const folderId = searchParams.get('folderId')

    const where: Record<string, unknown> = { userId: session.user.id }
    if (folderId === 'null') {
        where.folderId = null
    } else if (folderId) {
        where.folderId = folderId
    }

    const locations = await prisma.globalLocation.findMany({
        where,
        include: { images: true },
        orderBy: { createdAt: 'desc' }
    })

    const signedLocations = await Promise.all(
        locations.map((loc) => attachMediaFieldsToGlobalLocation(loc))
    )

    return NextResponse.json({ locations: signedLocations })
})

// 新建场景
export const POST = apiHandler(async (request: NextRequest) => {
    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const body = await request.json()
    const taskLocale = resolveTaskLocale(request, body)
    const bodyMeta = toObject((body as Record<string, unknown>).meta)
    const acceptLanguage = request.headers.get('accept-language') || ''
    const { name, summary, folderId, artStyle } = body

    if (!name) {
        throw new ApiError('INVALID_PARAMS')
    }

    if (folderId) {
        const folder = await prisma.globalAssetFolder.findUnique({
            where: { id: folderId }
        })
        if (!folder || folder.userId !== session.user.id) {
            throw new ApiError('INVALID_PARAMS')
        }
    }

    const location = await prisma.globalLocation.create({
        data: {
            userId: session.user.id,
            folderId: folderId || null,
            name: name.trim(),
            summary: summary?.trim() || null
        }
    })

    await prisma.globalLocationImage.createMany({
        data: [
            { locationId: location.id, imageIndex: 0, description: summary?.trim() || name.trim() },
            { locationId: location.id, imageIndex: 1, description: summary?.trim() || name.trim() },
            { locationId: location.id, imageIndex: 2, description: summary?.trim() || name.trim() }
        ]
    })

    const locationWithImages = await prisma.globalLocation.findUnique({
        where: { id: location.id },
        include: { images: true }
    })

    if (summary?.trim()) {
        const { getBaseUrl } = await import('@/lib/env')
        const baseUrl = getBaseUrl()
        fetch(`${baseUrl}/api/asset-hub/generate-image`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': request.headers.get('cookie') || '',
                ...(acceptLanguage ? { 'Accept-Language': acceptLanguage } : {})
            },
            body: JSON.stringify({
                type: 'location',
                id: location.id,
                artStyle: artStyle || 'american-comic',
                locale: taskLocale || undefined,
                meta: {
                    ...bodyMeta,
                    locale: taskLocale || bodyMeta.locale || undefined,
                },
            })
        }).catch(err => {
            _ulogError('[Locations API] 后台生成任务触发失败:', err)
        })
    }

    const withMedia = locationWithImages
        ? await attachMediaFieldsToGlobalLocation(locationWithImages)
        : locationWithImages

    return NextResponse.json({ success: true, location: withMedia })
})
