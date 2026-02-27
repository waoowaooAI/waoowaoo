import { NextRequest, NextResponse } from 'next/server'
import { generateUniqueKey, getSignedUrl, uploadToCOS } from '@/lib/cos'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * POST /api/asset-hub/upload-temp
 * 上传临时文件（Base64），返回签名 URL
 * 支持图片和音频格式
 */
export const POST = apiHandler(async (request: NextRequest) => {
    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const body = await request.json()
    const { imageBase64, base64, extension } = body

    // 支持两种调用方式：
    // 1. 图片模式：{ imageBase64: "data:image/..." }
    // 2. 通用模式：{ base64: "...", type: "audio/wav", extension: "wav" }

    let buffer: Buffer
    let ext: string

    if (imageBase64) {
        // 图片模式
        const matches = imageBase64.match(/^data:image\/(\w+);base64,(.+)$/)
        if (!matches) {
            throw new ApiError('INVALID_PARAMS')
        }
        ext = matches[1] === 'jpeg' ? 'jpg' : matches[1]
        buffer = Buffer.from(matches[2], 'base64')
    } else if (base64 && extension) {
        // 通用模式（音频等）
        buffer = Buffer.from(base64, 'base64')
        ext = extension
    } else {
        throw new ApiError('INVALID_PARAMS')
    }

    // 上传到 COS
    const key = generateUniqueKey(`temp-${session.user.id}-${Date.now()}`, ext)
    await uploadToCOS(buffer, key)

    // 返回签名 URL（有效期 1 小时）
    const signedUrl = getSignedUrl(key, 3600)

    return NextResponse.json({
        success: true,
        url: signedUrl,
        key
    })
})
