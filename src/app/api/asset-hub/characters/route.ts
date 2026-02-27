import { logError as _ulogError } from '@/lib/logging/core'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { attachMediaFieldsToGlobalCharacter } from '@/lib/media/attach'
import { resolveMediaRefFromLegacyValue } from '@/lib/media/service'
import { PRIMARY_APPEARANCE_INDEX } from '@/lib/constants'
import { encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { resolveTaskLocale } from '@/lib/task/resolve-locale'

function toObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value as Record<string, unknown>
}

// 获取用户所有角色（支持 folderId 筛选）
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

    const characters = await prisma.globalCharacter.findMany({
        where,
        include: { appearances: true },
        orderBy: { createdAt: 'desc' }
    })

    const signedCharacters = await Promise.all(
        characters.map((char) => attachMediaFieldsToGlobalCharacter(char))
    )

    return NextResponse.json({ characters: signedCharacters })
})

// 新建角色
export const POST = apiHandler(async (request: NextRequest) => {
    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const body = await request.json()
    const taskLocale = resolveTaskLocale(request, body)
    const bodyMeta = toObject((body as Record<string, unknown>).meta)
    const acceptLanguage = request.headers.get('accept-language') || ''
    const {
        name,
        description,
        folderId,
        initialImageUrl,
        referenceImageUrl,
        referenceImageUrls,
        generateFromReference,
        artStyle,
        customDescription
    } = body

    if (!name) {
        throw new ApiError('INVALID_PARAMS')
    }

    let allReferenceImages: string[] = []
    if (referenceImageUrls && Array.isArray(referenceImageUrls)) {
        allReferenceImages = referenceImageUrls.slice(0, 5)
    } else if (referenceImageUrl) {
        allReferenceImages = [referenceImageUrl]
    }

    if (folderId) {
        const folder = await prisma.globalAssetFolder.findUnique({
            where: { id: folderId }
        })
        if (!folder || folder.userId !== session.user.id) {
            throw new ApiError('INVALID_PARAMS')
        }
    }

    const character = await prisma.globalCharacter.create({
        data: {
            userId: session.user.id,
            folderId: folderId || null,
            name: name.trim(),
            aliases: null
        }
    })

    const descText = description?.trim() || `${name.trim()} 的角色设定`
    const imageMedia = await resolveMediaRefFromLegacyValue(initialImageUrl || null)
    const appearance = await prisma.globalCharacterAppearance.create({
        data: {
            characterId: character.id,
            appearanceIndex: PRIMARY_APPEARANCE_INDEX,
            changeReason: '初始形象',
            description: descText,
            descriptions: JSON.stringify([descText]),
            imageUrl: initialImageUrl || null,
            imageMediaId: imageMedia?.id || null,
            imageUrls: encodeImageUrls(initialImageUrl ? [initialImageUrl] : []),
            previousImageUrls: encodeImageUrls([])}
    })

    if (generateFromReference && allReferenceImages.length > 0) {
        const { getBaseUrl } = await import('@/lib/env')
        const baseUrl = getBaseUrl()
        fetch(`${baseUrl}/api/asset-hub/reference-to-character`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': request.headers.get('cookie') || '',
                ...(acceptLanguage ? { 'Accept-Language': acceptLanguage } : {})
            },
            body: JSON.stringify({
                referenceImageUrls: allReferenceImages,
                characterName: name.trim(),
                characterId: character.id,
                appearanceId: appearance.id,
                isBackgroundJob: true,
                artStyle: artStyle || 'american-comic',
                customDescription: customDescription || undefined,
                locale: taskLocale || undefined,
                meta: {
                    ...bodyMeta,
                    locale: taskLocale || bodyMeta.locale || undefined,
                },
            })
        }).catch(err => {
            _ulogError('[Characters API] 后台生成任务触发失败:', err)
        })
    }

    const characterWithAppearances = await prisma.globalCharacter.findUnique({
        where: { id: character.id },
        include: { appearances: true }
    })

    const withMedia = characterWithAppearances
        ? await attachMediaFieldsToGlobalCharacter(characterWithAppearances)
        : characterWithAppearances

    return NextResponse.json({ success: true, character: withMedia })
})
