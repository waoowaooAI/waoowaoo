import { logError as _ulogError } from '@/lib/logging/core'
/**
 * 撤回重新生成的图片，恢复到上一版本
 * POST /api/novel-promotion/[projectId]/undo-regenerate
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deleteCOSObject } from '@/lib/cos'
import { decodeImageUrlsFromDb, encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

interface CharacterAppearanceRecord {
    id: string
    imageUrl: string | null
    imageUrls: string | null
    previousImageUrl: string | null
    previousImageUrls: string | null
    description: string | null
    descriptions: unknown
    previousDescription: string | null
    previousDescriptions: unknown
}

interface LocationImageRecord {
    id: string
    imageUrl: string | null
    previousImageUrl: string | null
    description: string | null
    previousDescription: string | null
}

interface LocationRecord {
    images?: LocationImageRecord[]
}

interface PanelRecord {
    id: string
    imageUrl: string | null
    previousImageUrl: string | null
}

interface UndoRegenerateTx {
    characterAppearance: {
        update(args: Record<string, unknown>): Promise<unknown>
    }
    locationImage: {
        update(args: Record<string, unknown>): Promise<unknown>
    }
}

interface UndoRegenerateDb extends UndoRegenerateTx {
    characterAppearance: {
        findUnique(args: Record<string, unknown>): Promise<CharacterAppearanceRecord | null>
        update(args: Record<string, unknown>): Promise<unknown>
    }
    novelPromotionLocation: {
        findUnique(args: Record<string, unknown>): Promise<LocationRecord | null>
    }
    novelPromotionPanel: {
        findUnique(args: Record<string, unknown>): Promise<PanelRecord | null>
        update(args: Record<string, unknown>): Promise<unknown>
    }
    $transaction<T>(fn: (tx: UndoRegenerateTx) => Promise<T>): Promise<T>
}

export const POST = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await context.params
    const db = prisma as unknown as UndoRegenerateDb

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult

    const { type, id, appearanceId } = await request.json()

    // 🔒 UUID 格式验证辅助函数
    const isValidUUID = (str: unknown): boolean => {
        if (typeof str !== 'string') return false
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        return uuidRegex.test(str)
    }

    if (!type || !id) {
        throw new ApiError('INVALID_PARAMS')
    }

    if (type === 'character') {
        // 🔒 验证 appearanceId 是有效的 UUID
        if (!appearanceId || !isValidUUID(appearanceId)) {
            _ulogError(`[undo-regenerate] 收到无效的 appearanceId: ${appearanceId} (类型: ${typeof appearanceId})`)
            throw new ApiError('INVALID_PARAMS')
        }
        return await undoCharacterRegenerate(db, appearanceId)
    } else if (type === 'location') {
        return await undoLocationRegenerate(db, id)
    } else if (type === 'panel') {
        return await undoPanelRegenerate(db, id)
    }

    throw new ApiError('INVALID_PARAMS')
})

async function undoCharacterRegenerate(db: UndoRegenerateDb, appearanceId: string) {
    // 使用 UUID 直接查询形象
    const appearance = await db.characterAppearance.findUnique({
        where: { id: appearanceId },
        include: { character: true }
    })

    if (!appearance) {
        throw new ApiError('NOT_FOUND')
    }

    const previousImageUrls = decodeImageUrlsFromDb(appearance.previousImageUrls, 'characterAppearance.previousImageUrls')

    // 检查是否有上一版本
    if (!appearance.previousImageUrl && previousImageUrls.length === 0) {
        throw new ApiError('INVALID_PARAMS')
    }

    // 删除当前图片
    const currentImageUrls = decodeImageUrlsFromDb(appearance.imageUrls, 'characterAppearance.imageUrls')
    for (const key of currentImageUrls) {
        if (key) {
            try {
                const storageKey = await resolveStorageKeyFromMediaValue(key)
                if (storageKey) await deleteCOSObject(storageKey)
            } catch { }
        }
    }

    const restoredImageUrls = previousImageUrls.length > 0
        ? previousImageUrls
        : (appearance.previousImageUrl ? [appearance.previousImageUrl] : [])

    await db.$transaction(async (tx) => {
        await tx.characterAppearance.update({
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
    })

    return NextResponse.json({
        success: true,
        message: '已撤回到上一版本（图片和描述词）'
    })
}

async function undoLocationRegenerate(db: UndoRegenerateDb, locationId: string) {
    // 获取场景和图片
    const location = await db.novelPromotionLocation.findUnique({
        where: { id: locationId },
        include: { images: { orderBy: { imageIndex: 'asc' } } }
    })

    if (!location) {
        throw new ApiError('NOT_FOUND')
    }

    // 检查是否有上一版本
    const hasPrevious = location.images?.some((img) => img.previousImageUrl)
    if (!hasPrevious) {
        throw new ApiError('INVALID_PARAMS')
    }

    // 删除当前图片并恢复上一版本
    await db.$transaction(async (tx) => {
        for (const img of location.images || []) {
            if (img.previousImageUrl) {
                // 删除当前图片
                if (img.imageUrl) {
                    try {
                        const storageKey = await resolveStorageKeyFromMediaValue(img.imageUrl)
                        if (storageKey) await deleteCOSObject(storageKey)
                    } catch { }
                }
                // 恢复上一版本（图片 + 描述词）
                await tx.locationImage.update({
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
    })

    return NextResponse.json({
        success: true,
        message: '已撤回到上一版本（图片和描述词）'
    })
}

/**
 * 撤回 Panel 镜头图片到上一版本
 */
async function undoPanelRegenerate(db: UndoRegenerateDb, panelId: string) {
    // 获取镜头
    const panel = await db.novelPromotionPanel.findUnique({
        where: { id: panelId }
    })

    if (!panel) {
        throw new ApiError('NOT_FOUND')
    }

    // 检查是否有上一版本
    if (!panel.previousImageUrl) {
        throw new ApiError('INVALID_PARAMS')
    }

    // 删除当前图片（如果存在）
    if (panel.imageUrl) {
        try {
            const storageKey = await resolveStorageKeyFromMediaValue(panel.imageUrl)
            if (storageKey) await deleteCOSObject(storageKey)
        } catch { }
    }

    // 恢复上一版本
    await db.novelPromotionPanel.update({
        where: { id: panelId },
        data: {
            imageUrl: panel.previousImageUrl,
            previousImageUrl: null,
            candidateImages: null  // 清空候选图片
        }
    })

    return NextResponse.json({
        success: true,
        message: '镜头图片已撤回到上一版本'
    })
}
