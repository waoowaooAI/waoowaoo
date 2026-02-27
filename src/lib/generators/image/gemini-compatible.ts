import { logInfo as _ulogInfo, logWarn as _ulogWarn, logErrorCtx } from '@/lib/logging/core'
import { getLogContext } from '@/lib/logging/context'
/**
 * Gemini 兼容层图片生成器
 * 
 * 支持使用 Google Gemini API 格式的第三方服务（如 GRSAI/Nano Banana）
 * 通过自定义 baseUrl 和 API Key 连接兼容服务
 */

import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai'
import { BaseImageGenerator, ImageGenerateParams, GenerateResult } from '../base'
import { getProviderConfig } from '@/lib/api-config'
import { getImageBase64Cached } from '@/lib/image-cache'

type ContentPart = { inlineData: { mimeType: string; data: string } } | { text: string }

function getPartKeys(part: unknown): string {
    if (!part || typeof part !== 'object') return 'unknown'
    return Object.keys(part).join(',')
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message
    if (typeof error === 'object' && error !== null) {
        const candidate = (error as { message?: unknown }).message
        if (typeof candidate === 'string') return candidate
    }
    return '未知错误'
}

export class GeminiCompatibleImageGenerator extends BaseImageGenerator {
    private modelId: string
    private providerId?: string

    constructor(modelId?: string, providerId?: string) {
        super()
        // 默认使用 nano-banana-fast 模型
        this.modelId = modelId || 'nano-banana-fast'
        this.providerId = providerId
    }

    protected async doGenerate(params: ImageGenerateParams): Promise<GenerateResult> {
        const { userId, prompt, referenceImages = [], options = {} } = params

        const config = await getProviderConfig(userId, this.providerId || 'gemini-compatible')
        if (!config.baseUrl) {
            throw new Error(`PROVIDER_BASE_URL_MISSING: ${config.id}`)
        }
        const {
            aspectRatio,
            resolution,
        } = options

        const allowedOptionKeys = new Set([
            'provider',
            'modelId',
            'modelKey',
            'aspectRatio',
            'resolution',
            'outputFormat',
        ])
        for (const [key, value] of Object.entries(options)) {
            if (value === undefined) continue
            if (!allowedOptionKeys.has(key)) {
                throw new Error(`GEMINI_COMPATIBLE_IMAGE_OPTION_UNSUPPORTED: ${key}`)
            }
        }

        // 🔥 使用自定义 baseUrl 初始化 SDK
        // @google/genai SDK 通过 httpOptions.baseUrl 支持自定义端点
        const ai = new GoogleGenAI({
            apiKey: config.apiKey,
            httpOptions: {
                baseUrl: config.baseUrl
            }
        })

        // 构建内容数组
        const contentParts: ContentPart[] = []

        // 添加参考图片（最多 14 张）
        for (let i = 0; i < Math.min(referenceImages.length, 14); i++) {
            const imageData = referenceImages[i]

            if (imageData.startsWith('data:')) {
                // Base64 格式
                const base64Start = imageData.indexOf(';base64,')
                if (base64Start !== -1) {
                    const mimeType = imageData.substring(5, base64Start)
                    const data = imageData.substring(base64Start + 8)
                    contentParts.push({ inlineData: { mimeType, data } })
                }
            } else if (imageData.startsWith('http') || imageData.startsWith('/')) {
                // URL 格式（包括本地相对路径 /api/files/...）：下载转 base64
                try {
                    // 🔧 本地模式修复：相对路径需要补全完整 URL
                    let fullUrl = imageData
                    if (imageData.startsWith('/')) {
                        const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
                        fullUrl = `${baseUrl}${imageData}`
                    }
                    const base64DataUrl = await getImageBase64Cached(fullUrl)
                    const base64Start = base64DataUrl.indexOf(';base64,')
                    if (base64Start !== -1) {
                        const mimeType = base64DataUrl.substring(5, base64Start)
                        const data = base64DataUrl.substring(base64Start + 8)
                        contentParts.push({ inlineData: { mimeType, data } })
                    }
                } catch (e) {
                    _ulogWarn(`下载参考图片 ${i + 1} 失败:`, e)
                }
            } else {
                // 纯 base64
                contentParts.push({
                    inlineData: { mimeType: 'image/png', data: imageData }
                })
            }
        }

        // 添加文本提示
        contentParts.push({ text: prompt })

        // 安全配置（关闭过滤）
        const safetySettings = [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ]

        const ctx = getLogContext()

        logErrorCtx(ctx, `[GeminiCompatible] 🔍 使用模型: ${this.modelId}, baseUrl: ${config.baseUrl}`)

        // 🔥 请求参数调试日志
        const imagePartsSummary = contentParts
            .filter((p): p is { inlineData: { mimeType: string; data: string } } => 'inlineData' in p)
            .map((p, i) => `图${i + 1}: ${p.inlineData.mimeType}, ${Math.round(p.inlineData.data.length / 1024)}KB`)
        const textPartsSummary = contentParts
            .filter((p): p is { text: string } => 'text' in p)
            .map(p => p.text.substring(0, 200))
        logErrorCtx(ctx, `[GeminiCompatible] 🔍 请求参数:`, JSON.stringify({
            model: this.modelId,
            aspectRatio,
            resolution,
            refImageCount: referenceImages.length,
            contentPartsCount: contentParts.length,
            imagePartsSummary,
            promptPreview: textPartsSummary[0] || '(empty)',
        }))

        try {
            // 调用 API（使用用户配置的模型名称）
            const response = await ai.models.generateContent({
                model: this.modelId,
                contents: [{ parts: contentParts }],
                config: {
                    safetySettings,
                    // 🔥 关键：告诉 Gemini 返回图片
                    responseModalities: ['IMAGE', 'TEXT'],
                    ...(aspectRatio || resolution
                        ? {
                            imageConfig: {
                                ...(aspectRatio ? { aspectRatio } : {}),
                                ...(resolution ? { imageSize: resolution } : {}),
                            },
                        }
                        : {})
                }
            })

            // 提取图片
            const candidate = response.candidates?.[0]
            const parts = candidate?.content?.parts || []

            for (const part of parts) {
                if (part.inlineData) {
                    const imageBase64 = part.inlineData.data
                    if (imageBase64) {
                        const mimeType = part.inlineData.mimeType || 'image/png'
                        _ulogInfo(`[GeminiCompatible] 成功生成图片`)
                        return {
                            success: true,
                            imageBase64,
                            imageUrl: `data:${mimeType};base64,${imageBase64}`
                        }
                    }
                }
            }

            // 检查失败原因
            const finishReason = candidate?.finishReason
            if (finishReason === 'IMAGE_SAFETY' || finishReason === 'SAFETY') {
                throw new Error('内容因安全策略被过滤')
            }

            // 🔥 检查是否返回了文本而非图片（常见的代理路由问题）
            const textParts = parts.filter((part) => typeof part?.text === 'string')
            if (textParts.length > 0) {
                _ulogWarn(`[GeminiCompatible] 代理返回了文本而非图片: ${textParts[0].text?.substring(0, 100)}...`)
                throw new Error('代理服务返回了文本而非图片，请检查模型配置')
            }

            // 🔥 详细日志：打印完整响应结构
            logErrorCtx(ctx, `[GeminiCompatible] ❌ 响应未包含图片，调试信息:`)
            logErrorCtx(ctx, `  - candidates 数量: ${response.candidates?.length || 0}`)
            logErrorCtx(ctx, `  - parts 数量: ${parts.length}`)
            logErrorCtx(ctx, `  - finishReason: ${candidate?.finishReason}`)
            logErrorCtx(ctx, `  - parts 类型: ${parts.map((part) => getPartKeys(part)).join(' | ')}`)
            logErrorCtx(ctx, `  - 完整响应: ${JSON.stringify(response, null, 2)}`)

            throw new Error('Gemini 兼容服务未返回图片')
        } catch (error: unknown) {
            const message = getErrorMessage(error)

            // 🔥 增强诊断：解析代理/SDK 返回的结构化错误信息
            const errorObj = error as Record<string, unknown> | undefined
            const innerError = (errorObj?.error ?? errorObj) as Record<string, unknown> | undefined
            const errorType = innerError?.type as string | undefined
            const errorCode = innerError?.code as string | undefined
            const errorParam = innerError?.param as string | undefined
            const statusCode = (errorObj as { status?: number })?.status
            const responseBody = (errorObj as { responseBody?: unknown })?.responseBody

            logErrorCtx(ctx, `[GeminiCompatible] 生成失败:`, JSON.stringify({
                message,
                errorType: errorType || null,
                errorCode: errorCode || null,
                errorParam: errorParam || null,
                statusCode: statusCode || null,
                model: this.modelId,
                baseUrl: config.baseUrl,
                refImageCount: referenceImages.length,
                promptPreview: prompt.substring(0, 100),
                ...(responseBody ? { responseBody: JSON.stringify(responseBody).substring(0, 500) } : {}),
                stack: error instanceof Error ? error.stack?.split('\n').slice(0, 3).join(' | ') : undefined,
            }))

            // 处理常见错误（注意顺序：内容安全 > 余额 > 网络 > 429限流 > 其他）
            const lowerMessage = message.toLowerCase()

            // 1. 内容安全（优先于 429，因为代理可能将 IMAGE_SAFETY 包装为 429）
            if (lowerMessage.includes('image_safety') || lowerMessage.includes('safety') ||
                lowerMessage.includes('sensitive') || lowerMessage.includes('blocked') ||
                lowerMessage.includes('policy_violation') || lowerMessage.includes('prohibited') ||
                lowerMessage.includes('moderation') || lowerMessage.includes('harm')) {
                throw new Error('图片内容可能涉及敏感信息，请修改描述后重试')
            }

            // 2. 余额/配额不足
            if (lowerMessage.includes('insufficient') || lowerMessage.includes('402') ||
                lowerMessage.includes('credits')) {
                throw new Error('API 余额不足，请充值后重试')
            }

            // 3. 认证错误
            if (lowerMessage.includes('401') || lowerMessage.includes('unauthorized')) {
                throw new Error('API Key 无效，请检查配置')
            }

            // 4. 模型不存在
            if (lowerMessage.includes('404') || lowerMessage.includes('not found')) {
                throw new Error(`模型 ${this.modelId} 不存在于服务端`)
            }

            // 5. 网络错误
            if (lowerMessage.includes('fetch failed') || lowerMessage.includes('econnreset') ||
                lowerMessage.includes('enotfound') || lowerMessage.includes('network')) {
                throw new Error('网络请求失败，请检查网络连接或稍后重试')
            }

            // 6. Gemini 空响应（代理将其包装为 429，但实际是内容生成失败/被过滤）
            if (lowerMessage.includes('empty_response') || lowerMessage.includes('empty response') ||
                lowerMessage.includes('no meaningful content')) {
                throw new Error('Gemini 未返回有效图片，内容可能被过滤或生成失败，请修改描述后重试')
            }

            // 7. 429 限流（排除了已被上面捕获的 empty_response 和 safety 场景）
            if (statusCode === 429 || lowerMessage.includes('rate') || lowerMessage.includes('too many request')) {
                throw new Error('API 请求频率超限，请稍后重试')
            }

            // 8. 配额限制（通用）
            if (lowerMessage.includes('quota') || lowerMessage.includes('limit')) {
                throw new Error('API 配额不足')
            }

            throw error
        }
    }
}
