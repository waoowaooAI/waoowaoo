import { createScopedLogger, logError as _ulogError } from '@/lib/logging/core'
import { getProviderConfig } from '@/lib/user-api/runtime-config'
import type { AiProviderVideoExecutionContext, GenerateResult } from '@/lib/ai-providers/runtime-types'
import { buildFalQueueUrl } from '@/lib/ai-providers/fal/base-url'

type FalVideoOptions = NonNullable<AiProviderVideoExecutionContext['options']>

type FalWanVideoPayload = {
  image_url: string
  prompt: string
  resolution?: string
  duration?: string
}

type FalVeo31VideoPayload = {
  image_url: string
  prompt: string
  aspect_ratio?: string
  duration?: string
  generate_audio: false
}

type FalKlingV25VideoPayload = {
  image_url: string
  prompt: string
  duration?: string
  negative_prompt: string
  cfg_scale: number
}

type FalKlingV3VideoPayload = {
  start_image_url: string
  prompt: string
  aspect_ratio?: string
  duration?: string
  generate_audio: false
}

type FalVideoPayload =
  | FalWanVideoPayload
  | FalVeo31VideoPayload
  | FalKlingV25VideoPayload
  | FalKlingV3VideoPayload

const FAL_VIDEO_ENDPOINTS: Record<string, string> = {
  'fal-wan25': 'wan/v2.6/image-to-video',
  'fal-veo31': 'fal-ai/veo3.1/fast/image-to-video',
  'fal-ai/kling-video/v2.5-turbo/pro/image-to-video': 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
  'fal-ai/kling-video/v3/standard/image-to-video': 'fal-ai/kling-video/v3/standard/image-to-video',
  'fal-ai/kling-video/v3/pro/image-to-video': 'fal-ai/kling-video/v3/pro/image-to-video',
}

function assertAllowedFalVideoOptions(options: FalVideoOptions) {
  const allowedOptionKeys = new Set([
    'provider',
    'modelId',
    'modelKey',
    'duration',
    'resolution',
    'aspectRatio',
    'prompt',
    'fps',
    'generateAudio',
    'lastFrameImageUrl',
  ])
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue
    if (!allowedOptionKeys.has(key)) {
      throw new Error(`FAL_VIDEO_OPTION_UNSUPPORTED: ${key}`)
    }
  }
}

export async function executeFalVideoGeneration(input: AiProviderVideoExecutionContext): Promise<GenerateResult> {
  const { apiKey } = await getProviderConfig(input.userId, input.selection.provider)

  const options: FalVideoOptions = input.options ?? {}
  assertAllowedFalVideoOptions(options)

  const duration = options.duration
  const resolution = options.resolution
  const aspectRatio = options.aspectRatio
  const modelId = input.selection.modelId || 'fal-wan25'

  const endpoint = FAL_VIDEO_ENDPOINTS[modelId]
  if (!endpoint) {
    throw new Error(`FAL_VIDEO_MODEL_UNSUPPORTED: ${modelId}`)
  }

  const logger = createScopedLogger({ module: 'worker.fal-video', action: 'fal_video_generate' })
  logger.info({ message: 'FAL video generation request', details: { modelId, endpoint } })

  let payload: FalVideoPayload
  switch (modelId) {
    case 'fal-wan25':
      payload = {
        image_url: input.imageUrl,
        prompt: input.options?.prompt || '',
        ...(resolution ? { resolution } : {}),
        ...(typeof duration === 'number' ? { duration: String(duration) } : {}),
      }
      break
    case 'fal-veo31':
      payload = {
        image_url: input.imageUrl,
        prompt: input.options?.prompt || '',
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        ...(typeof duration === 'number' ? { duration: `${duration}s` } : {}),
        generate_audio: false,
      }
      break
    case 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video':
      payload = {
        image_url: input.imageUrl,
        prompt: input.options?.prompt || '',
        ...(typeof duration === 'number' ? { duration: String(duration) } : {}),
        negative_prompt: 'blur, distort, and low quality',
        cfg_scale: 0.5,
      }
      break
    case 'fal-ai/kling-video/v3/standard/image-to-video':
    case 'fal-ai/kling-video/v3/pro/image-to-video':
      payload = {
        start_image_url: input.imageUrl,
        prompt: input.options?.prompt || '',
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        ...(typeof duration === 'number' ? { duration: String(duration) } : {}),
        generate_audio: false,
      }
      break
    default:
      throw new Error(`FAL_VIDEO_MODEL_UNSUPPORTED: ${modelId}`)
  }

  try {
    const submitResponse = await fetch(buildFalQueueUrl(endpoint), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    })

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text()
      throw new Error(`FAL 提交失败 (${submitResponse.status}): ${errorText}`)
    }

    const submitData = (await submitResponse.json()) as { request_id?: unknown }
    const requestId = typeof submitData.request_id === 'string' ? submitData.request_id : ''
    if (!requestId) {
      throw new Error('FAL 未返回 request_id')
    }
    logger.info({ message: 'FAL video task submitted', details: { requestId } })
    return {
      success: true,
      async: true,
      requestId,
      endpoint,
      externalId: `FAL:VIDEO:${endpoint}:${requestId}`,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误'
    _ulogError('[FAL Video] 提交失败:', message)
    throw new Error(`FAL 视频任务提交失败: ${message}`)
  }
}
