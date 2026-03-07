import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { attachMediaFieldsToGlobalLocation } from '@/lib/media/attach'
import { isArtStyleValue } from '@/lib/constants'
import { normalizeImageGenerationCount } from '@/lib/image-generation/count'

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
    const { name, summary, folderId, artStyle } = body
    const count = normalizeImageGenerationCount('location', (body as Record<string, unknown>).count)

    if (!name) {
        throw new ApiError('INVALID_PARAMS')
    }
    const normalizedArtStyle = typeof artStyle === 'string' ? artStyle.trim() : ''
    if (!isArtStyleValue(normalizedArtStyle)) {
        throw new ApiError('INVALID_PARAMS', {
            code: 'INVALID_ART_STYLE',
            message: 'artStyle is required and must be a supported value',
        })
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
            artStyle: normalizedArtStyle,
            summary: summary?.trim() || null
        }
    })

    await prisma.globalLocationImage.createMany({
        data: Array.from({ length: count }, (_value, imageIndex) => ({
            locationId: location.id,
            imageIndex,
            description: summary?.trim() || name.trim(),
        }))
    })

    const locationWithImages = await prisma.globalLocation.findUnique({
        where: { id: location.id },
        include: { images: true }
    })

    const withMedia = locationWithImages
        ? await attachMediaFieldsToGlobalLocation(locationWithImages)
        : locationWithImages

    return NextResponse.json({ success: true, location: withMedia })
})
