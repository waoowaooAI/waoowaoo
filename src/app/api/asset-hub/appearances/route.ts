import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { PRIMARY_APPEARANCE_INDEX, isArtStyleValue } from '@/lib/constants'
import { buildCharacterDescriptionFields } from '@/lib/assets/description-fields'

interface AppearanceBody {
    characterId?: string
    changeReason?: string
    description?: string
    appearanceIndex?: number
    artStyle?: string
}

interface GlobalCharacterAppearanceSummary {
    id: string
    appearanceIndex: number
    artStyle?: string | null
    description?: string | null
    descriptions?: string | null
}

interface GlobalCharacterRecord {
    appearances?: GlobalCharacterAppearanceSummary[]
}

interface AssetHubAppearancesDb {
    globalCharacter: {
        findFirst(args: Record<string, unknown>): Promise<GlobalCharacterRecord | null>
    }
    globalCharacterAppearance: {
        create(args: Record<string, unknown>): Promise<unknown>
        findFirst(args: Record<string, unknown>): Promise<GlobalCharacterAppearanceSummary | null>
        update(args: Record<string, unknown>): Promise<unknown>
        deleteMany(args: Record<string, unknown>): Promise<unknown>
    }
}

/**
 * POST /api/asset-hub/appearances
 * 添加子形象
 */
export const POST = apiHandler(async (request: NextRequest) => {
    const db = prisma as unknown as AssetHubAppearancesDb
    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const body = (await request.json()) as AppearanceBody
    const { characterId, changeReason, description, artStyle } = body

    if (!characterId || !changeReason) {
        throw new ApiError('INVALID_PARAMS')
    }

    const character = await db.globalCharacter.findFirst({
        where: { id: characterId, userId: session.user.id },
        include: { appearances: true }
    })
    if (!character) {
        throw new ApiError('NOT_FOUND')
    }

    const maxIndex = character.appearances?.reduce((max, appearance) => Math.max(max, appearance.appearanceIndex), 0) || 0
    const nextIndex = maxIndex + 1
    const inputArtStyle = typeof artStyle === 'string' ? artStyle.trim() : ''
    const inheritedArtStyle = (() => {
        if (inputArtStyle) return inputArtStyle
        const primaryAppearance = character.appearances?.find((item) => item.appearanceIndex === PRIMARY_APPEARANCE_INDEX)
            || character.appearances?.[0]
        const stored = typeof primaryAppearance?.artStyle === 'string' ? primaryAppearance.artStyle.trim() : ''
        return stored
    })()
    if (!isArtStyleValue(inheritedArtStyle)) {
        throw new ApiError('INVALID_PARAMS', {
            code: 'INVALID_ART_STYLE',
            message: 'artStyle is required and must be a supported value',
        })
    }

    const appearance = await db.globalCharacterAppearance.create({
        data: {
            characterId,
            appearanceIndex: nextIndex,
            changeReason,
            artStyle: inheritedArtStyle,
            description: description?.trim() || null,
            descriptions: description?.trim() ? JSON.stringify([description.trim()]) : null,
            imageUrls: encodeImageUrls([]),
            previousImageUrls: encodeImageUrls([])}
    })

    return NextResponse.json({ success: true, appearance })
})

/**
 * PATCH /api/asset-hub/appearances
 * 更新子形象描述
 */
export const PATCH = apiHandler(async (request: NextRequest) => {
    const db = prisma as unknown as AssetHubAppearancesDb
    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const body = (await request.json()) as AppearanceBody
    const { characterId, appearanceIndex, description, changeReason, artStyle } = body

    if (!characterId || appearanceIndex === undefined) {
        throw new ApiError('INVALID_PARAMS')
    }

    const character = await db.globalCharacter.findFirst({
        where: { id: characterId, userId: session.user.id }
    })
    if (!character) {
        throw new ApiError('NOT_FOUND')
    }

    const appearance = await db.globalCharacterAppearance.findFirst({
        where: { characterId, appearanceIndex }
    })
    if (!appearance) {
        throw new ApiError('NOT_FOUND')
    }

    const updateData: Record<string, unknown> = {}
    if (description !== undefined) {
        const nextDescription = description.trim()
        const descriptionFields = buildCharacterDescriptionFields({
            descriptions: appearance.descriptions ?? null,
            fallbackDescription: appearance.description ?? null,
            index: 0,
            nextDescription,
        })
        updateData.description = descriptionFields.description
        updateData.descriptions = descriptionFields.descriptions
    }
    if (changeReason !== undefined) {
        updateData.changeReason = changeReason
    }
    if (artStyle !== undefined) {
        if (typeof artStyle !== 'string') {
            throw new ApiError('INVALID_PARAMS', {
                code: 'INVALID_ART_STYLE',
                message: 'artStyle must be a supported value',
            })
        }
        const normalizedArtStyle = artStyle.trim()
        if (!isArtStyleValue(normalizedArtStyle)) {
            throw new ApiError('INVALID_PARAMS', {
                code: 'INVALID_ART_STYLE',
                message: 'artStyle must be a supported value',
            })
        }
        updateData.artStyle = normalizedArtStyle
    }

    await db.globalCharacterAppearance.update({
        where: { id: appearance.id },
        data: updateData
    })

    return NextResponse.json({ success: true })
})

/**
 * DELETE /api/asset-hub/appearances
 * 删除子形象
 */
export const DELETE = apiHandler(async (request: NextRequest) => {
    const db = prisma as unknown as AssetHubAppearancesDb
    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const { searchParams } = new URL(request.url)
    const characterId = searchParams.get('characterId')
    const appearanceIndex = searchParams.get('appearanceIndex')

    if (!characterId || !appearanceIndex) {
        throw new ApiError('INVALID_PARAMS')
    }

    const character = await db.globalCharacter.findFirst({
        where: { id: characterId, userId: session.user.id }
    })
    if (!character) {
        throw new ApiError('NOT_FOUND')
    }

    if (parseInt(appearanceIndex, 10) === PRIMARY_APPEARANCE_INDEX) {
        throw new ApiError('INVALID_PARAMS')
    }

    await db.globalCharacterAppearance.deleteMany({
        where: { characterId, appearanceIndex: parseInt(appearanceIndex, 10) }
    })

    return NextResponse.json({ success: true })
})
