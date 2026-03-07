import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { uploadObject, generateUniqueKey, getSignedUrl } from '@/lib/storage'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

interface VoiceDesignPayload {
    voiceId?: string
    audioBase64?: string
}

interface CharacterVoiceJsonBody {
    characterId?: string
    voiceDesign?: VoiceDesignPayload
    voiceType?: string | null
    voiceId?: string | null
    customVoiceUrl?: string | null
}

interface AssetHubCharacterVoiceDb {
    globalCharacter: {
        findFirst(args: Record<string, unknown>): Promise<{ id: string } | null>
        update(args: Record<string, unknown>): Promise<unknown>
    }
}

/**
 * POST /api/asset-hub/character-voice
 * 上传自定义音色音频
 */
export const POST = apiHandler(async (request: NextRequest) => {
    const db = prisma as unknown as AssetHubCharacterVoiceDb
    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const contentType = request.headers.get('content-type') || ''

    // 处理 JSON 请求（AI 声音设计）
    if (contentType.includes('application/json')) {
        const body = (await request.json()) as CharacterVoiceJsonBody
        const { characterId, voiceDesign } = body

        if (!characterId || !voiceDesign) {
            throw new ApiError('INVALID_PARAMS')
        }

        const { voiceId, audioBase64 } = voiceDesign
        if (!voiceId || !audioBase64) {
            throw new ApiError('INVALID_PARAMS')
        }

        // 验证角色属于用户
        const character = await db.globalCharacter.findFirst({
            where: { id: characterId, userId: session.user.id }
        })
        if (!character) {
            throw new ApiError('NOT_FOUND')
        }

        const audioBuffer = Buffer.from(audioBase64, 'base64')
        const key = generateUniqueKey(`global-voice/${session.user.id}/${characterId}`, 'wav')
        const cosUrl = await uploadObject(audioBuffer, key)

        await db.globalCharacter.update({
            where: { id: characterId },
            data: {
                voiceType: 'qwen-designed',
                voiceId: voiceId,
                customVoiceUrl: cosUrl
            }
        })

        const signedAudioUrl = getSignedUrl(cosUrl, 7200)

        return NextResponse.json({
            success: true,
            audioUrl: signedAudioUrl
        })
    }

    // 处理 FormData 请求（文件上传）
    const formData = await request.formData()
    const file = formData.get('file') as File
    const characterId = formData.get('characterId') as string

    if (!file || !characterId) {
        throw new ApiError('INVALID_PARAMS')
    }

    // 验证角色属于用户
    const character = await db.globalCharacter.findFirst({
        where: { id: characterId, userId: session.user.id }
    })
    if (!character) {
        throw new ApiError('NOT_FOUND')
    }

    // 验证文件类型
    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/x-m4a']
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg|m4a)$/i)) {
        throw new ApiError('INVALID_PARAMS')
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const ext = file.name.split('.').pop()?.toLowerCase() || 'mp3'
    const key = generateUniqueKey(`global-voice/${session.user.id}/${characterId}`, ext)
    const audioUrl = await uploadObject(buffer, key)

    await db.globalCharacter.update({
        where: { id: characterId },
        data: {
            voiceType: 'uploaded',
            voiceId: null,
            customVoiceUrl: audioUrl
        }
    })

    const signedAudioUrl = getSignedUrl(audioUrl, 7200)

    return NextResponse.json({
        success: true,
        audioUrl: signedAudioUrl
    })
})

/**
 * PATCH /api/asset-hub/character-voice
 * 更新角色音色设置
 */
export const PATCH = apiHandler(async (request: NextRequest) => {
    const db = prisma as unknown as AssetHubCharacterVoiceDb
    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const body = (await request.json()) as CharacterVoiceJsonBody
    const { characterId, voiceType, voiceId, customVoiceUrl } = body

    if (!characterId) {
        throw new ApiError('INVALID_PARAMS')
    }

    // 验证角色属于用户
    const character = await db.globalCharacter.findFirst({
        where: { id: characterId, userId: session.user.id }
    })
    if (!character) {
        throw new ApiError('NOT_FOUND')
    }

    await db.globalCharacter.update({
        where: { id: characterId },
        data: {
            voiceType: voiceType || null,
            voiceId: voiceId || null,
            customVoiceUrl: customVoiceUrl || null
        }
    })

    return NextResponse.json({ success: true })
})
