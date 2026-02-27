import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { NextRequest } from 'next/server'
import { getSignedUrl, toFetchableUrl } from '@/lib/cos'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * 代理下载单个视频文件
 * 用于解决 COS 跨域下载问题
 */
export const GET = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await context.params
    const { searchParams } = new URL(request.url)
    const videoKey = searchParams.get('key')

    if (!videoKey) {
        throw new ApiError('INVALID_PARAMS')
    }

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult

    // 生成签名 URL 并下载
    let fetchUrl: string
    if (videoKey.startsWith('http://') || videoKey.startsWith('https://')) {
        fetchUrl = videoKey
    } else {
        fetchUrl = toFetchableUrl(getSignedUrl(videoKey, 3600))
    }

    _ulogInfo(`[视频代理] 下载: ${fetchUrl.substring(0, 100)}...`)

    const response = await fetch(fetchUrl)
    if (!response.ok) {
        throw new Error(`Failed to fetch video: ${response.statusText}`)
    }

    // 获取内容类型和长度
    const contentType = response.headers.get('content-type') || 'video/mp4'
    const contentLength = response.headers.get('content-length')

    // 流式返回视频数据
    const headers: HeadersInit = {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache'
    }
    if (contentLength) {
        headers['Content-Length'] = contentLength
    }

    return new Response(response.body, { headers })
})
