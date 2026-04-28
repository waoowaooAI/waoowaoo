import type { AiProviderImageExecutionContext, GenerateResult } from '@/lib/ai-providers/runtime-types'
import { createOpenAICompatClient, readStringOption, resolveOpenAICompatClientConfig, toUploadFile } from '@/lib/ai-providers/openai-compatible/errors'
import type { OpenAICompatMediaTemplate } from '@/lib/ai-providers/openai-compatible/user-template'
import { generateImageViaOpenAICompatTemplate } from '@/lib/ai-providers/openai-compatible/user-template'

type OpenAICompatImageOptions = NonNullable<AiProviderImageExecutionContext['options']>

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

function assertAllowedOptions(options: OpenAICompatImageOptions) {
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

function resolveRawSize(options: OpenAICompatImageOptions): string | undefined {
  const size = readStringOption(options.size, 'size')
  const resolution = readStringOption(options.resolution, 'resolution')
  if (size && resolution && size !== resolution) {
    throw new Error('OPENAI_COMPAT_IMAGE_OPTION_CONFLICT: size and resolution must match')
  }
  return size || resolution
}

function resolveModelId(modelId: string | undefined, options: OpenAICompatImageOptions): string {
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

type ImagePayloads = {
  b64Json: string | null
  url: string | null
  urls: string[]
}

type UnknownObject = { [key: string]: unknown }

function isUnknownObject(value: unknown): value is UnknownObject {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readAllImagePayloads(response: unknown): ImagePayloads {
  if (!isUnknownObject(response)) {
    return { b64Json: null, url: null, urls: [] }
  }
  const data = response.data
  if (!Array.isArray(data) || data.length === 0) {
    return { b64Json: null, url: null, urls: [] }
  }

  const urls: string[] = []
  let firstB64: string | null = null

  for (const item of data) {
    if (!isUnknownObject(item)) continue
    const rawUrl = item.url
    const rawB64 = item.b64_json
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

async function generateImageViaOpenAICompat(input: {
  userId: string
  providerId: string
  modelId: string | undefined
  prompt: string
  referenceImages: string[]
  options: OpenAICompatImageOptions
}): Promise<GenerateResult> {
  assertAllowedOptions(input.options)
  const config = await resolveOpenAICompatClientConfig(input.userId, input.providerId)
  const client = createOpenAICompatClient(config)

  const normalizedModelId = resolveModelId(input.modelId, input.options)
  const responseFormat = normalizeResponseFormat(input.options.responseFormat)
  const outputFormat = normalizeOutputFormat(input.options.outputFormat)
  const quality = normalizeGenerateQuality(input.options.quality)
  const rawSize = resolveRawSize(input.options)
  const size = normalizeOpenAIImageSize(rawSize)

  if (input.referenceImages.length > 0) {
    let response: unknown
    try {
      response = await client.images.edit({
        model: normalizedModelId,
        prompt: input.prompt,
        image: await Promise.all(input.referenceImages.map((image, index) => toUploadFile(image, index))),
        ...(responseFormat ? { response_format: responseFormat } : {}),
        ...(outputFormat ? { output_format: outputFormat } : {}),
        ...(quality ? { quality } : {}),
        ...(size ? { size } : {}),
      } as unknown as Parameters<typeof client.images.edit>[0])
    } catch (error) {
      throw toSafeOpenAICompatImageRequestError({
        operation: 'edit',
        providerId: input.providerId,
        modelId: normalizedModelId,
        size,
        responseFormat,
        outputFormat,
        quality,
        referenceImageCount: input.referenceImages.length,
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
      prompt: input.prompt,
      ...(responseFormat ? { response_format: responseFormat } : {}),
      ...(outputFormat ? { output_format: outputFormat } : {}),
      ...(quality ? { quality } : {}),
      ...(size ? { size } : {}),
    } as unknown as Parameters<typeof client.images.generate>[0])
  } catch (error) {
    throw toSafeOpenAICompatImageRequestError({
      operation: 'generate',
      providerId: input.providerId,
      modelId: normalizedModelId,
      size,
      responseFormat,
      outputFormat,
      quality,
      referenceImageCount: input.referenceImages.length,
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

function aspectRatioToOpenAISize(aspectRatio: string | undefined): string | undefined {
  if (!aspectRatio) return undefined
  const ratio = aspectRatio.trim()
  const mapping: Record<string, string> = {
    '1:1': '1024x1024',
    '16:9': '1792x1024',
    '9:16': '1024x1792',
    '3:2': '1536x1024',
    '2:3': '1024x1536',
  }
  return mapping[ratio] || undefined
}

export async function executeOpenAiCompatibleImageGeneration(input: AiProviderImageExecutionContext) {
  const options = input.options ?? {}
  const referenceImages = options.referenceImages ?? []
  const generatorOptions: OpenAICompatImageOptions = { ...options }
  delete generatorOptions.referenceImages
  const compatTemplate = input.selection.compatMediaTemplate as OpenAICompatMediaTemplate | undefined
  if (compatTemplate) {
    return await generateImageViaOpenAICompatTemplate({
      userId: input.userId,
      providerId: input.selection.provider,
      modelId: input.selection.modelId,
      modelKey: input.selection.modelKey,
      prompt: input.prompt,
      referenceImages,
      options: {
        ...generatorOptions,
        provider: input.selection.provider,
        modelId: input.selection.modelId,
        modelKey: input.selection.modelKey,
      },
      profile: 'openai-compatible',
      template: compatTemplate,
    })
  }

  let openaiCompatOptions = { ...generatorOptions }
  if (openaiCompatOptions.aspectRatio && typeof openaiCompatOptions.aspectRatio === 'string') {
    const mappedSize = aspectRatioToOpenAISize(openaiCompatOptions.aspectRatio)
    if (mappedSize && !openaiCompatOptions.size) {
      openaiCompatOptions = { ...openaiCompatOptions, size: mappedSize }
    }
    delete openaiCompatOptions.aspectRatio
  }

  return await generateImageViaOpenAICompat({
    userId: input.userId,
    providerId: input.selection.provider,
    modelId: input.selection.modelId,
    prompt: input.prompt,
    referenceImages,
    options: {
      ...openaiCompatOptions,
      provider: input.selection.provider,
      modelId: input.selection.modelId,
      modelKey: input.selection.modelKey,
    } as OpenAICompatImageOptions,
  })
}
