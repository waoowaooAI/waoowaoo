import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { uploadToCOS, generateUniqueKey, getSignedUrl } from '@/lib/cos'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * POST /api/asset-hub/voices/upload
 * 上传音频文件到音色库
 */
export const POST = apiHandler(async (request: NextRequest) => {
    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const formData = await request.formData()
    const file = formData.get('file') as File
    const name = formData.get('name') as string
    const folderId = formData.get('folderId') as string | null
    const description = formData.get('description') as string | null

    if (!file) {
        throw new ApiError('INVALID_PARAMS')
    }

    if (!name || !name.trim()) {
        throw new ApiError('INVALID_PARAMS')
    }

    // 支持的音频类型
    const audioTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/x-m4a', 'audio/aac']
    const isAudioFile = audioTypes.includes(file.type) || file.name.match(/\.(mp3|wav|ogg|m4a|aac)$/i)

    if (!isAudioFile) {
        throw new ApiError('INVALID_PARAMS')
    }

    // 验证 folderId（如果提供）
    if (folderId) {
        const folder = await prisma.globalAssetFolder.findUnique({
            where: { id: folderId }
        })
        if (!folder || folder.userId !== session.user.id) {
            throw new ApiError('INVALID_PARAMS')
        }
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const audioExt = file.name.split('.').pop()?.toLowerCase() || 'mp3'

    // 上传到 COS
    const key = generateUniqueKey(`voices/${session.user.id}/${Date.now()}`, audioExt)
    const cosUrl = await uploadToCOS(buffer, key)

    // 创建音色记录
    const voice = await prisma.globalVoice.create({
        data: {
            userId: session.user.id,
            folderId: folderId || null,
            name: name.trim(),
            description: description?.trim() || null,
            voiceId: null,
            voiceType: 'uploaded',
            customVoiceUrl: cosUrl,
            voicePrompt: null,
            gender: null,
            language: 'zh'
        }
    })

    // 签名 URL
    const signedUrl = getSignedUrl(cosUrl, 7 * 24 * 3600)

    return NextResponse.json({
        success: true,
        voice: {
            ...voice,
            customVoiceUrl: signedUrl
        }
    })
})
