import type { GenerateResult } from '@/lib/ai-providers/adapters/media/generators/base'
import type { OpenAICompatImageRequest } from './types'
import {
  createOpenAICompatClient,
  readStringOption,
  resolveOpenAICompatClientConfig,
  toUploadFile,
} from './common'

type OpenAIImageResponseFormat = 'url' | 'b64_json'
type OpenAIImageOutputFormat = 'png' | 'jpeg' | 'webp'
type OpenAIImageGenerateQuality = 'standard' | 'hd' | 'low' | 'medium' | 'high' | 'auto'
type OpenAIImageGenerateSize =
  | 'auto'
  | '1024x1024'
  | '1536x1024'
  | '1024x1536'
  | '256x256'
  | '512x512'
  | '1792x1024'
  | '1024x1792'

const OPENAI_IMAGE_OPTION_KEYS = new Set([
  'provider',
  'modelId',
  'modelKey',
  'size',
  'resolution',
  'quality',
  'responseFormat',
  'outputFormat',
])

function assertAllowedOptions(options: Record<string, unknown>) {
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue
    if (!OPENAI_IMAGE_OPTION_KEYS.has(key)) {
      throw new Error(`OPENAI_COMPAT_IMAGE_OPTION_UNSUPPORTED: ${key}`)
    }
  }
}

function normalizeResponseFormat(value: unknown): OpenAIImageResponseFormat | undefined {
  const normalized = readStringOption(value, 'responseFormat')
  if (!normalized) return undefined
  if (normalized === 'url' || normalized === 'b64_json') return normalized
  throw new Error(`OPENAI_COMPAT_IMAGE_OPTION_UNSUPPORTED: responseFormat=${normalized}`)
}

function normalizeOutputFormat(value: unknown): OpenAIImageOutputFormat | undefined {
  const normalized = readStringOption(value, 'outputFormat')
  if (!normalized) return undefined
  if (normalized === 'png' || normalized === 'jpeg' || normalized === 'webp') return normalized
  throw new Error(`OPENAI_COMPAT_IMAGE_OPTION_UNSUPPORTED: outputFormat=${normalized}`)
}

function normalizeGenerateQuality(value: unknown): OpenAIImageGenerateQuality | undefined {
  const normalized = readStringOption(value, 'quality')
  if (!normalized) return undefined
  if (
    normalized === 'standard'
    || normalized === 'hd'
    || normalized === 'low'
    || normalized === 'medium'
    || normalized === 'high'
    || normalized === 'auto'
  ) {
    return normalized
  }
  throw new Error(`OPENAI_COMPAT_IMAGE_OPTION_UNSUPPORTED: quality=${normalized}`)
}

function normalizeOpenAIImageSize(value: string | undefined): OpenAIImageGenerateSize | undefined {
  if (!value) return undefined
  if (
    value === 'auto'
    || value === '1024x1024'
    || value === '1536x1024'
    || value === '1024x1536'
    || value === '256x256'
    || value === '512x512'
    || value === '1792x1024'
    || value === '1024x1792'
  ) {
    return value
  }
  throw new Error(`OPENAI_COMPAT_IMAGE_OPTION_UNSUPPORTED: size=${value}`)
}

function resolveRawSize(options: Record<string, unknown>): string | undefined {
  const size = readStringOption(options.size, 'size')
  const resolution = readStringOption(options.resolution, 'resolution')
  if (size && resolution && size !== resolution) {
    throw new Error('OPENAI_COMPAT_IMAGE_OPTION_CONFLICT: size and resolution must match')
  }
  return size || resolution
}

function resolveModelId(modelId: string | undefined, options: Record<string, unknown>): string {
  const optionModelId = readStringOption(options.modelId, 'modelId')
  const selected = (modelId || optionModelId || '').trim()
  if (selected) return selected
  return 'gpt-image-1'
}

function toMimeFromOutputFormat(outputFormat: string | undefined): string {
  if (outputFormat === 'jpeg' || outputFormat === 'jpg') return 'image/jpeg'
  if (outputFormat === 'webp') return 'image/webp'
  return 'image/png'
}

interface ImagePayloads {
  /** 第一张图的 base64（向后兼容） */
  b64Json: string | null
  /** 第一张图的 URL（向后兼容） */
  url: string | null
  /** 所有图的 URL 列表（接口返回多张时有值） */
  urls: string[]
}

function readAllImagePayloads(response: unknown): ImagePayloads {
  if (typeof response !== 'object' || response === null) {
    return { b64Json: null, url: null, urls: [] }
  }
  const data = (response as { data?: unknown }).data
  if (!Array.isArray(data) || data.length === 0) {
    return { b64Json: null, url: null, urls: [] }
  }

  const urls: string[] = []
  let firstB64: string | null = null

  for (const item of data) {
    if (typeof item !== 'object' || item === null) continue
    const rawUrl = (item as { url?: unknown }).url
    const rawB64 = (item as { b64_json?: unknown }).b64_json
    if (typeof rawUrl === 'string' && rawUrl.trim()) {
      urls.push(rawUrl.trim())
    }
    if (firstB64 === null && typeof rawB64 === 'string' && rawB64.trim()) {
      firstB64 = rawB64.trim()
    }
  }

  return {
    b64Json: firstB64,
    url: urls[0] ?? null,
  urls,
  }
}

function toSafeOpenAICompatImageRequestError(params: {
  operation: 'generate' | 'edit'
  providerId: string
  modelId: string
  size: string | undefined
  responseFormat: OpenAIImageResponseFormat | undefined
  outputFormat: OpenAIImageOutputFormat | undefined
  quality: OpenAIImageGenerateQuality | undefined
  referenceImageCount: number
  cause: unknown
}): Error {
  const causeMessage = params.cause instanceof Error ? params.cause.message : String(params.cause)
  const responseFormatValue = params.responseFormat ? `response_format=${params.responseFormat}` : 'response_format=<unset>'
  const sizeValue = params.size ? `size=${params.size}` : 'size=<unset>'
  const outputFormatValue = params.outputFormat ? `output_format=${params.outputFormat}` : 'output_format=<unset>'
  const qualityValue = params.quality ? `quality=${params.quality}` : 'quality=<unset>'

  return new Error(
    [
      'OPENAI_COMPAT_IMAGE_REQUEST_FAILED',
      `operation=${params.operation}`,
      `providerId=${params.providerId}`,
      `model=${params.modelId}`,
      sizeValue,
      responseFormatValue,
      outputFormatValue,
      qualityValue,
      `referenceImageCount=${params.referenceImageCount}`,
      `cause=${causeMessage}`,
    ].join(' '),
    { cause: params.cause },
  )
}

export async function generateImageViaOpenAICompat(request: OpenAICompatImageRequest): Promise<GenerateResult> {
  const {
    userId,
    providerId,
    modelId,
    prompt,
    referenceImages = [],
    options = {},
  } = request

  assertAllowedOptions(options)
  const config = await resolveOpenAICompatClientConfig(userId, providerId)
  const client = createOpenAICompatClient(config)

  const normalizedModelId = resolveModelId(modelId, options)
  const responseFormat = normalizeResponseFormat(options.responseFormat)
  const outputFormat = normalizeOutputFormat(options.outputFormat)
  const quality = normalizeGenerateQuality(options.quality)
  const rawSize = resolveRawSize(options)
  const size = normalizeOpenAIImageSize(rawSize)

  if (referenceImages.length > 0) {
    let response: unknown
    try {
      response = await client.images.edit({
        model: normalizedModelId,
        prompt,
        image: await Promise.all(referenceImages.map((image, index) => toUploadFile(image, index))),
        ...(responseFormat ? { response_format: responseFormat } : {}),
        ...(outputFormat ? { output_format: outputFormat } : {}),
        ...(quality ? { quality } : {}),
        ...(size ? { size } : {}),
      } as unknown as Parameters<typeof client.images.edit>[0])
    } catch (error) {
      throw toSafeOpenAICompatImageRequestError({
        operation: 'edit',
        providerId,
        modelId: normalizedModelId,
        size,
        responseFormat,
        outputFormat,
        quality,
        referenceImageCount: referenceImages.length,
        cause: error,
      })
    }

    const imagePayload = readAllImagePayloads(response)
    const imageBase64 = imagePayload.b64Json
    if (typeof imageBase64 === 'string' && imageBase64.trim().length > 0) {
      const mimeType = toMimeFromOutputFormat(outputFormat)
      return {
        success: true,
        imageBase64,
        imageUrl: `data:${mimeType};base64,${imageBase64}`,
      }
    }
    const imageUrl = imagePayload.url
    if (typeof imageUrl === 'string' && imageUrl.trim().length > 0) {
      return {
        success: true,
        imageUrl,
        ...(imagePayload.urls.length > 1 ? { imageUrls: imagePayload.urls } : {}),
      }
    }
    throw new Error('OPENAI_COMPAT_IMAGE_EMPTY_RESPONSE: no image data returned')
  }

  let response: unknown
  try {
    response = await client.images.generate({
      model: normalizedModelId,
      prompt,
      ...(responseFormat ? { response_format: responseFormat } : {}),
      ...(outputFormat ? { output_format: outputFormat } : {}),
      ...(quality ? { quality } : {}),
      ...(size ? { size } : {}),
    } as unknown as Parameters<typeof client.images.generate>[0])
  } catch (error) {
    throw toSafeOpenAICompatImageRequestError({
      operation: 'generate',
      providerId,
      modelId: normalizedModelId,
      size,
      responseFormat,
      outputFormat,
      quality,
      referenceImageCount: referenceImages.length,
      cause: error,
    })
  }

  const imagePayload = readAllImagePayloads(response)
  const imageBase64 = imagePayload.b64Json
  if (typeof imageBase64 === 'string' && imageBase64.trim().length > 0) {
    const mimeType = toMimeFromOutputFormat(outputFormat)
    return {
      success: true,
      imageBase64,
      imageUrl: `data:${mimeType};base64,${imageBase64}`,
    }
  }
  const imageUrl = imagePayload.url
  if (typeof imageUrl === 'string' && imageUrl.trim().length > 0) {
    return {
      success: true,
      imageUrl,
      ...(imagePayload.urls.length > 1 ? { imageUrls: imagePayload.urls } : {}),
    }
  }
  throw new Error('OPENAI_COMPAT_IMAGE_EMPTY_RESPONSE: no image data returned')
}
