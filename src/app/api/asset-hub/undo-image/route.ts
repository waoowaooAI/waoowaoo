import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decodeImageUrlsFromDb, encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { PRIMARY_APPEARANCE_INDEX } from '@/lib/constants'

interface UndoImageBody {
    type?: 'character' | 'location'
    id?: string
    appearanceIndex?: number
}

interface GlobalCharacterAppearanceRecord {
    id: string
    imageUrl: string | null
    description: string | null
    descriptions: unknown
    previousImageUrl: string | null
    previousImageUrls: string | null
    previousDescription: string | null
    previousDescriptions: unknown
}

interface GlobalLocationImageRecord {
    id: string
    imageUrl: string | null
    description: string | null
    previousImageUrl: string | null
    previousDescription: string | null
}

interface GlobalLocationRecord {
    images?: GlobalLocationImageRecord[]
}

interface AssetHubUndoDb {
    globalCharacterAppearance: {
        findFirst(args: Record<string, unknown>): Promise<GlobalCharacterAppearanceRecord | null>
        update(args: Record<string, unknown>): Promise<unknown>
    }
    globalLocation: {
        findFirst(args: Record<string, unknown>): Promise<GlobalLocationRecord | null>
    }
    globalLocationImage: {
        update(args: Record<string, unknown>): Promise<unknown>
    }
}

/**
 * POST /api/asset-hub/undo-image
 * 撤回到上一版本图片（同时恢复描述词）
 */
export const POST = apiHandler(async (request: NextRequest) => {
    const db = prisma as unknown as AssetHubUndoDb
    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const body = (await request.json()) as UndoImageBody
    const { type, id, appearanceIndex } = body

    if (type === 'character') {
        const appearance = await db.globalCharacterAppearance.findFirst({
            where: {
                characterId: id,
                appearanceIndex: appearanceIndex ?? PRIMARY_APPEARANCE_INDEX,
                character: { userId: session.user.id }
            }
        })

        if (!appearance) {
            throw new ApiError('NOT_FOUND')
        }

        const previousImageUrls = decodeImageUrlsFromDb(appearance.previousImageUrls, 'globalCharacterAppearance.previousImageUrls')
        if (!appearance.previousImageUrl && previousImageUrls.length === 0) {
            throw new ApiError('INVALID_PARAMS')
        }

        const restoredImageUrls = previousImageUrls.length > 0
            ? previousImageUrls
            : (appearance.previousImageUrl ? [appearance.previousImageUrl] : [])

        // 恢复上一版本（图片 + 描述词）
        await db.globalCharacterAppearance.update({
            where: { id: appearance.id },
            data: {
                imageUrl: appearance.previousImageUrl || restoredImageUrls[0] || null,
                imageUrls: encodeImageUrls(restoredImageUrls),
                previousImageUrl: null,
                previousImageUrls: encodeImageUrls([]),
                selectedIndex: null,
                // 🔥 同时恢复描述词
                description: appearance.previousDescription ?? appearance.description,
                descriptions: appearance.previousDescriptions ?? appearance.descriptions,
                previousDescription: null,
                previousDescriptions: null
            }
        })

        return NextResponse.json({ success: true, message: '已撤回到上一版本（图片和描述词）' })

    } else if (type === 'location') {
        const location = await db.globalLocation.findFirst({
            where: { id, userId: session.user.id },
            include: { images: true }
        })

        if (!location) {
            throw new ApiError('NOT_FOUND')
        }

        // 恢复所有图片的上一版本（图片 + 描述词）
        for (const img of location.images || []) {
            if (img.previousImageUrl) {
                await db.globalLocationImage.update({
                    where: { id: img.id },
                    data: {
                        imageUrl: img.previousImageUrl,
                        previousImageUrl: null,
                        // 🔥 同时恢复描述词
                        description: img.previousDescription ?? img.description,
                        previousDescription: null
                    }
                })
            }
        }

        return NextResponse.json({ success: true, message: '已撤回到上一版本（图片和描述词）' })

    } else {
        throw new ApiError('INVALID_PARAMS')
    }
})
