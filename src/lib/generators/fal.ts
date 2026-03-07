import { createScopedLogger, logError as _ulogError } from '@/lib/logging/core'
/**
 * FAL 生成器（统一图像 + 视频）
 * 
 * 图像模型：
 * - Banana Pro (2K/4K) - fal-ai/nano-banana-pro       (modelId: 'banana')
 * - Banana 2  (1K/2K/4K) - fal-ai/nano-banana-2       (modelId: 'banana-2')
 * 
 * 视频模型：
 * - Wan 2.6 (fal-wan25) - wan/v2.6/image-to-video
 * - Veo 3.1 (fal-veo31) - fal-ai/veo3.1/fast/image-to-video
 * - Sora 2 (fal-sora2) - fal-ai/sora-2/image-to-video  
 * - Kling 2.5 Turbo Pro - fal-ai/kling-video/v2.5-turbo/pro/image-to-video
 * - Kling 3 Standard - fal-ai/kling-video/v3/standard/image-to-video
 * - Kling 3 Pro - fal-ai/kling-video/v3/pro/image-to-video
 */

import {
    BaseImageGenerator,
    BaseVideoGenerator,
    ImageGenerateParams,
    VideoGenerateParams,
    GenerateResult
} from './base'
import { getProviderConfig } from '@/lib/api-config'
import { submitFalTask } from '@/lib/async-submit'
import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'

// ============================================================
// 图像模型端点映射（modelId → FAL 端点前缀）
// ============================================================

const FAL_IMAGE_ENDPOINTS: Record<string, { base: string; edit: string }> = {
    'banana': { base: 'fal-ai/nano-banana-pro', edit: 'fal-ai/nano-banana-pro/edit' },
    'banana-2': { base: 'fal-ai/nano-banana-2', edit: 'fal-ai/nano-banana-2/edit' },
}

// ============================================================
// 视频模型端点映射
// ============================================================

const FAL_VIDEO_ENDPOINTS: Record<string, string> = {
    'fal-wan25': 'wan/v2.6/image-to-video',
    'fal-veo31': 'fal-ai/veo3.1/fast/image-to-video',
    'fal-sora2': 'fal-ai/sora-2/image-to-video',
    'fal-ai/kling-video/v2.5-turbo/pro/image-to-video': 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
    'fal-ai/kling-video/v3/standard/image-to-video': 'fal-ai/kling-video/v3/standard/image-to-video',
    'fal-ai/kling-video/v3/pro/image-to-video': 'fal-ai/kling-video/v3/pro/image-to-video',
}

// ============================================================
// FAL 图像生成器 (Banana Pro / Banana 2)
// ============================================================

export class FalImageGenerator extends BaseImageGenerator {
    protected async doGenerate(params: ImageGenerateParams): Promise<GenerateResult> {
        const { userId, prompt, referenceImages = [], options = {} } = params

        const { apiKey } = await getProviderConfig(userId, 'fal')
        const {
            aspectRatio,
            resolution,
            outputFormat = 'png',
            modelId: optModelId = 'banana'
        } = options as {
            aspectRatio?: string
            resolution?: string
            outputFormat?: string
            provider?: string
            modelId?: string
            modelKey?: string
        }

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
                throw new Error(`FAL_IMAGE_OPTION_UNSUPPORTED: ${key}`)
            }
        }
        if (resolution !== undefined && resolution !== '1K' && resolution !== '2K' && resolution !== '4K') {
            throw new Error(`FAL_IMAGE_OPTION_VALUE_UNSUPPORTED: resolution=${resolution}`)
        }

        // 根据 modelId 和是否有参考图片选择端点
        const hasReferenceImages = referenceImages.length > 0
        const endpointConfig = FAL_IMAGE_ENDPOINTS[optModelId] || FAL_IMAGE_ENDPOINTS['banana']
        const endpoint = hasReferenceImages ? endpointConfig.edit : endpointConfig.base

        const logger = createScopedLogger({
            module: 'worker.fal-image',
            action: 'fal_image_generate',
        })
        logger.info({
            message: 'FAL image generation request',
            details: {
                modelId: optModelId,
                endpoint,
                referenceImagesCount: referenceImages.length,
                hasReferenceImages,
                resolution: resolution ?? null,
                aspectRatio: aspectRatio ?? null,
                referenceImageUrls: referenceImages.map((u: string) => u.substring(0, 100)),
            },
        })

        const body: Record<string, unknown> = {
            prompt,
            num_images: 1,
            output_format: outputFormat
        }
        if (aspectRatio) {
            body.aspect_ratio = aspectRatio
        }
        if (resolution) {
            body.resolution = resolution
        }

        if (hasReferenceImages) {
            // 🔥 转换参考图片为Data URL（适配内网/本地环境）
            const dataUrls = await Promise.all(
                referenceImages.map(async (url: string) => {
                    // 如果已经是data URL，直接返回
                    if (url.startsWith('data:')) return url
                    // 否则转换为Data URL
                    return await normalizeToBase64ForGeneration(url)
                })
            )
            body.image_urls = dataUrls
            logger.info({
                message: 'FAL image reference images converted',
                details: {
                    count: referenceImages.length,
                    sizes: dataUrls.map((d: string) => `${Math.round(d.length / 1024)}KB`),
                },
            })
        }

        logger.info({
            message: 'FAL image request body summary',
            details: {
                url: `https://queue.fal.run/${endpoint}`,
                promptLength: prompt.length,
                imageUrlsCount: hasReferenceImages ? (body.image_urls as string[]).length : 0,
                resolution: body.resolution ?? null,
                aspectRatio: body.aspect_ratio ?? null,
                outputFormat: body.output_format,
            },
        })

        // 提交异步任务
        const submitResponse = await fetch(`https://queue.fal.run/${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Key ${apiKey}`
            },
            body: JSON.stringify(body),
            cache: 'no-store'
        })

        if (!submitResponse.ok) {
            const errorText = await submitResponse.text()
            throw new Error(`FAL 提交失败 (${submitResponse.status}): ${errorText}`)
        }

        const submitData = await submitResponse.json()
        const requestId = submitData.request_id

        if (!requestId) {
            throw new Error('FAL 未返回 request_id')
        }

        return {
            success: true,
            async: true,
            requestId,        // 向后兼容
            endpoint,         // 向后兼容
            externalId: `FAL:IMAGE:${endpoint}:${requestId}`  // 🔥 标准格式
        }
    }
}

// ============================================================
// FAL 视频生成器 (Wan 2.6, Veo 3.1, Sora 2, Kling)
// ============================================================

export class FalVideoGenerator extends BaseVideoGenerator {
    protected async doGenerate(params: VideoGenerateParams): Promise<GenerateResult> {
        const { userId, imageUrl, prompt = '', options = {} } = params

        const { apiKey } = await getProviderConfig(userId, 'fal')
        const {
            duration,
            resolution,
            aspectRatio,
            modelId = 'fal-wan25'
        } = options as {
            duration?: number
            resolution?: string
            aspectRatio?: string
            modelId?: string
            provider?: string
            modelKey?: string
        }

        const allowedOptionKeys = new Set([
            'provider',
            'modelId',
            'modelKey',
            'duration',
            'resolution',
            'aspectRatio',
        ])
        for (const [key, value] of Object.entries(options)) {
            if (value === undefined) continue
            if (!allowedOptionKeys.has(key)) {
                throw new Error(`FAL_VIDEO_OPTION_UNSUPPORTED: ${key}`)
            }
        }

        // 获取端点
        const endpoint = FAL_VIDEO_ENDPOINTS[modelId]
        if (!endpoint) {
            throw new Error(`FAL_VIDEO_MODEL_UNSUPPORTED: ${modelId}`)
        }
        const vLogger = createScopedLogger({ module: 'worker.fal-video', action: 'fal_video_generate' })
        vLogger.info({ message: 'FAL video generation request', details: { modelId, endpoint } })

        // 根据模型构建不同的请求体
        let input: Record<string, unknown>

        switch (modelId) {
            case 'fal-wan25':
                input = {
                    image_url: imageUrl,
                    prompt,
                    ...(resolution ? { resolution } : {}),
                    ...(typeof duration === 'number' ? { duration: String(duration) } : {})
                }
                break
            case 'fal-veo31':
                input = {
                    image_url: imageUrl,
                    prompt,
                    ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
                    ...(typeof duration === 'number' ? { duration: `${duration}s` } : {}),
                    generate_audio: false
                }
                break
            case 'fal-sora2':
                input = {
                    image_url: imageUrl,
                    prompt,
                    ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
                    ...(typeof duration === 'number' ? { duration } : {}),
                    delete_video: false
                }
                break
            case 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video':
                input = {
                    image_url: imageUrl,
                    prompt,
                    ...(typeof duration === 'number' ? { duration: String(duration) } : {}),
                    negative_prompt: 'blur, distort, and low quality',
                    cfg_scale: 0.5
                }
                break
            case 'fal-ai/kling-video/v3/standard/image-to-video':
            case 'fal-ai/kling-video/v3/pro/image-to-video':
                input = {
                    start_image_url: imageUrl,
                    prompt,
                    ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
                    ...(typeof duration === 'number' ? { duration: String(duration) } : {}),
                    generate_audio: false,
                }
                break
            default:
                throw new Error(`FAL_VIDEO_MODEL_UNSUPPORTED: ${modelId}`)
        }

        try {
            const requestId = await submitFalTask(endpoint, input, apiKey)
            vLogger.info({ message: 'FAL video task submitted', details: { requestId } })

            return {
                success: true,
                async: true,
                requestId,  // 向后兼容
                endpoint,   // 向后兼容  
                externalId: `FAL:VIDEO:${endpoint}:${requestId}`  // 🔥 标准格式
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : '未知错误'
            _ulogError(`[FAL Video] 提交失败:`, message)
            throw new Error(`FAL 视频任务提交失败: ${message}`)
        }
    }
}

// ============================================================
// 向后兼容别名
// ============================================================

export const FalBananaGenerator = FalImageGenerator
