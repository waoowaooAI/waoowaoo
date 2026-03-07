import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { resolveMediaRefFromLegacyValue } from '@/lib/media/service'
import { decodeImageUrlsFromDb } from '@/lib/contracts/image-urls-contract'
import { PRIMARY_APPEARANCE_INDEX } from '@/lib/constants'

/**
 * GET /api/asset-hub/picker
 * 获取用户的全局资产列表，用于在项目中选择要复制的资产
 * 
 * Query params:
 * - type: 'character' | 'location'
 */
export const GET = apiHandler(async (request: NextRequest) => {
    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'character'

    if (type === 'character') {
        const characters = await prisma.globalCharacter.findMany({
            where: { userId: session.user.id },
            include: {
                appearances: {
                    orderBy: { appearanceIndex: 'asc' }
                },
                folder: true
            },
            orderBy: { updatedAt: 'desc' }
        })

        const processedCharacters = await Promise.all(characters.map(async (char) => {
            const primaryAppearance = char.appearances.find((a) => a.appearanceIndex === PRIMARY_APPEARANCE_INDEX) || char.appearances[0]
            let previewUrl = null

            if (primaryAppearance) {
                const urls = decodeImageUrlsFromDb(primaryAppearance.imageUrls, 'globalCharacterAppearance.imageUrls')
                const selectedUrl = urls[primaryAppearance.selectedIndex ?? 0] || urls[0] || primaryAppearance.imageUrl
                if (selectedUrl) {
                    const media = await resolveMediaRefFromLegacyValue(selectedUrl)
                    previewUrl = media?.url || selectedUrl
                }
            }

            return {
                id: char.id,
                name: char.name,
                folderName: char.folder?.name || null,
                previewUrl,
                appearanceCount: char.appearances.length,
                hasVoice: !!(char.voiceId || char.customVoiceUrl)
            }
        }))

        return NextResponse.json({ characters: processedCharacters })
    }

    if (type === 'location') {
        const locations = await prisma.globalLocation.findMany({
            where: { userId: session.user.id },
            include: {
                images: {
                    orderBy: { imageIndex: 'asc' }
                },
                folder: true
            },
            orderBy: { updatedAt: 'desc' }
        })

        const processedLocations = await Promise.all(locations.map(async (loc) => {
            const selectedImage = loc.images.find((img) => img.isSelected) || loc.images[0]
            let previewUrl = null

            if (selectedImage?.imageUrl) {
                const media = await resolveMediaRefFromLegacyValue(selectedImage.imageUrl)
                previewUrl = media?.url || selectedImage.imageUrl
            }

            return {
                id: loc.id,
                name: loc.name,
                summary: loc.summary,
                folderName: loc.folder?.name || null,
                previewUrl,
                imageCount: loc.images.length
            }
        }))

        return NextResponse.json({ locations: processedLocations })
    }

    if (type === 'voice') {
        const voices = await prisma.globalVoice.findMany({
            where: { userId: session.user.id },
            include: {
                folder: true
            },
            orderBy: { updatedAt: 'desc' }
        })

        const processedVoices = await Promise.all(voices.map(async (voice) => {
            let previewUrl = null
            if (voice.customVoiceUrl) {
                const media = await resolveMediaRefFromLegacyValue(voice.customVoiceUrl)
                previewUrl = media?.url || voice.customVoiceUrl
            }

            return {
                id: voice.id,
                name: voice.name,
                description: voice.description,
                folderName: voice.folder?.name || null,
                previewUrl,
                voiceId: voice.voiceId,
                voiceType: voice.voiceType,
                gender: voice.gender,
                language: voice.language
            }
        }))

        return NextResponse.json({ voices: processedVoices })
    }

    throw new ApiError('INVALID_PARAMS')
})
