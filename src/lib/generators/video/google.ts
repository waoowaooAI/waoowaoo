/**
 * Google Veo 视频生成器
 */

import { GoogleGenAI } from '@google/genai'
import { BaseVideoGenerator, VideoGenerateParams, GenerateResult } from '../base'
import { getProviderConfig } from '@/lib/api-config'
import { imageUrlToBase64 } from '@/lib/cos'

interface GoogleVeoOptions {
    modelId?: string
    aspectRatio?: string
    resolution?: string
    duration?: number
    lastFrameImageUrl?: string
}

function dataUrlToInlineData(dataUrl: string): { mimeType: string; imageBytes: string } | null {
    const base64Start = dataUrl.indexOf(';base64,')
    if (base64Start === -1) return null
    const mimeType = dataUrl.substring(5, base64Start)
    const imageBytes = dataUrl.substring(base64Start + 8)
    return { mimeType, imageBytes }
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function extractOperationName(response: unknown): string | null {
    const obj = asRecord(response)
    if (!obj) return null
    if (typeof obj.name === 'string') return obj.name
    const operation = asRecord(obj.operation)
    if (operation && typeof operation.name === 'string') return operation.name
    if (typeof obj.operationName === 'string') return obj.operationName
    if (typeof obj.id === 'string') return obj.id
    return null
}

export class GoogleVeoVideoGenerator extends BaseVideoGenerator {
    private providerId: string

    constructor(providerId?: string) {
        super()
        this.providerId = providerId || 'google'
    }

    protected async doGenerate(params: VideoGenerateParams): Promise<GenerateResult> {
        const { userId, imageUrl, prompt = '', options = {} } = params

        const { apiKey } = await getProviderConfig(userId, this.providerId)
        const ai = new GoogleGenAI({ apiKey })

        const {
            modelId = 'veo-3.1-generate-preview',
            aspectRatio,
            resolution,
            duration,
            lastFrameImageUrl,
        } = options as GoogleVeoOptions

        const allowedOptionKeys = new Set([
            'provider',
            'modelId',
            'modelKey',
            'aspectRatio',
            'resolution',
            'duration',
            'lastFrameImageUrl',
        ])
        for (const [key, value] of Object.entries(options)) {
            if (value === undefined) continue
            if (!allowedOptionKeys.has(key)) {
                throw new Error(`GOOGLE_VIDEO_OPTION_UNSUPPORTED: ${key}`)
            }
        }

        const request: Record<string, unknown> = {
            model: modelId,
        }
        if (prompt.trim().length > 0) {
            request.prompt = prompt
        }
        const config: Record<string, unknown> = {}
        if (aspectRatio) config.aspectRatio = aspectRatio
        if (resolution) config.resolution = resolution
        if (typeof duration === 'number') config.durationSeconds = duration

        let hasImageInput = false
        // 添加首帧图片（图生视频）
        if (imageUrl) {
            const dataUrl = imageUrl.startsWith('data:') ? imageUrl : await imageUrlToBase64(imageUrl)
            const inlineData = dataUrlToInlineData(dataUrl)
            if (inlineData) {
                request.image = inlineData
                hasImageInput = true
            }
        }

        if (lastFrameImageUrl) {
            // 官方要求：lastFrame 仅支持 image-to-video，必须与 image 同时使用
            if (!hasImageInput) {
                throw new Error('Veo lastFrame requires image input')
            }
            const dataUrl = lastFrameImageUrl.startsWith('data:')
                ? lastFrameImageUrl
                : await imageUrlToBase64(lastFrameImageUrl)
            const inlineData = dataUrlToInlineData(dataUrl)
            if (!inlineData) {
                throw new Error('Veo lastFrame image is invalid')
            }
            config.lastFrame = inlineData
        }

        if (Object.keys(config).length > 0) {
            request.config = config
        }

        const response = await ai.models.generateVideos(
            request as unknown as Parameters<typeof ai.models.generateVideos>[0]
        )
        const operationName = extractOperationName(response)

        if (!operationName) {
            throw new Error('Veo 未返回 operation name')
        }

        return {
            success: true,
            async: true,
            requestId: operationName,
            externalId: `GOOGLE:VIDEO:${operationName}`
        }
    }
}
