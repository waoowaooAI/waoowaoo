import { createScopedLogger } from '@/lib/logging/core'
import { getProviderConfig } from '@/lib/api-config'
import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'
import { buildFalQueueUrl } from '@/lib/ai-providers/fal/base-url'
import type { AiProviderImageExecutionContext, GenerateResult } from '@/lib/ai-providers/runtime-types'

type FalImageOptions = NonNullable<AiProviderImageExecutionContext['options']>

type FalImageSubmitBody = {
  prompt: string
  num_images: number
  output_format: string
  aspect_ratio?: string
  resolution?: string
  image_urls?: string[]
}

const FAL_IMAGE_ENDPOINTS: Record<string, { base: string; edit: string }> = {
  banana: { base: 'fal-ai/nano-banana-pro', edit: 'fal-ai/nano-banana-pro/edit' },
  'banana-2': { base: 'fal-ai/nano-banana-2', edit: 'fal-ai/nano-banana-2/edit' },
}

function assertAllowedFalImageOptions(options: FalImageOptions) {
  const allowedOptionKeys = new Set([
    'provider',
    'modelId',
    'modelKey',
    'aspectRatio',
    'resolution',
    'outputFormat',
    'referenceImages',
  ])
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue
    if (!allowedOptionKeys.has(key)) {
      throw new Error(`FAL_IMAGE_OPTION_UNSUPPORTED: ${key}`)
    }
  }
}

export async function executeFalImageGeneration(input: AiProviderImageExecutionContext): Promise<GenerateResult> {
  const { apiKey } = await getProviderConfig(input.userId, input.selection.provider)

  const referenceImages = input.options?.referenceImages || []
  const options: FalImageOptions = input.options ?? {}
  assertAllowedFalImageOptions(options)

  const aspectRatio = options.aspectRatio
  const resolution = options.resolution
  const outputFormat = options.outputFormat ?? 'png'
  const modelId = input.selection.modelId || 'banana'

  if (resolution !== undefined && resolution !== '1K' && resolution !== '2K' && resolution !== '4K') {
    throw new Error(`FAL_IMAGE_OPTION_VALUE_UNSUPPORTED: resolution=${resolution}`)
  }

  const hasReferenceImages = referenceImages.length > 0
  const endpointConfig = FAL_IMAGE_ENDPOINTS[modelId] || FAL_IMAGE_ENDPOINTS.banana
  const endpoint = hasReferenceImages ? endpointConfig.edit : endpointConfig.base

  const logger = createScopedLogger({ module: 'worker.fal-image', action: 'fal_image_generate' })
  logger.info({
    message: 'FAL image generation request',
    details: {
      modelId,
      endpoint,
      referenceImagesCount: referenceImages.length,
      hasReferenceImages,
      resolution: resolution ?? null,
      aspectRatio: aspectRatio ?? null,
      referenceImageUrls: referenceImages.map((u) => u.substring(0, 100)),
    },
  })

  const body: FalImageSubmitBody = {
    prompt: input.prompt,
    num_images: 1,
    output_format: outputFormat,
  }
  if (aspectRatio) body.aspect_ratio = aspectRatio
  if (resolution) body.resolution = resolution

  if (hasReferenceImages) {
    const dataUrls = await Promise.all(
      referenceImages.map(async (url) => (url.startsWith('data:') ? url : await normalizeToBase64ForGeneration(url))),
    )
    body.image_urls = dataUrls
    logger.info({
      message: 'FAL image reference images converted',
      details: {
        count: referenceImages.length,
        sizes: dataUrls.map((d) => `${Math.round(d.length / 1024)}KB`),
      },
    })
  }

  const submitResponse = await fetch(buildFalQueueUrl(endpoint), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify(body),
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

  return {
    success: true,
    async: true,
    requestId,
    endpoint,
    externalId: `FAL:IMAGE:${endpoint}:${requestId}`,
  }
}
