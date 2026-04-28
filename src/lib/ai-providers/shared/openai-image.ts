import OpenAI, { toFile } from 'openai'
import { getInternalBaseUrl } from '@/lib/env'
import { getImageBase64Cached } from '@/lib/image-cache'
import type { GenerateResult } from '@/lib/ai-providers/runtime-types'

export const OPENAI_IMAGE_SIZES = ['auto', '1024x1024', '1536x1024', '1024x1536', '256x256', '512x512', '1792x1024', '1024x1792'] as const
export const OPENAI_OFFICIAL_IMAGE_SIZES = ['auto', '1024x1024', '1536x1024', '1024x1536'] as const
export const OPENAI_IMAGE_OUTPUT_FORMATS = ['png', 'jpeg', 'webp'] as const
export const OPENAI_IMAGE_RESPONSE_FORMATS = ['url', 'b64_json'] as const
export const OPENAI_IMAGE_QUALITIES = ['standard', 'hd', 'low', 'medium', 'high', 'auto'] as const
export const OPENAI_OFFICIAL_IMAGE_QUALITIES = ['low', 'medium', 'high', 'auto'] as const
export const OPENAI_IMAGE_BACKGROUNDS = ['transparent', 'opaque', 'auto'] as const
export const OPENAI_IMAGE_MODERATION_LEVELS = ['low', 'auto'] as const

export type OpenAIImageResponseFormat = typeof OPENAI_IMAGE_RESPONSE_FORMATS[number]
export type OpenAIImageOutputFormat = typeof OPENAI_IMAGE_OUTPUT_FORMATS[number]
export type OpenAIImageGenerateQuality = typeof OPENAI_IMAGE_QUALITIES[number]
export type OpenAIImageGenerateSize = typeof OPENAI_IMAGE_SIZES[number]
export type OpenAIImageBackground = typeof OPENAI_IMAGE_BACKGROUNDS[number]
export type OpenAIImageModeration = typeof OPENAI_IMAGE_MODERATION_LEVELS[number]

export type OpenAIImageProtocolOptions = {
  provider?: string
  modelId?: string
  modelKey?: string
  size?: string
  resolution?: string
  quality?: string
  responseFormat?: string
  outputFormat?: string
  background?: string
  outputCompression?: number
  moderation?: string
  [key: string]: unknown
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

function toAbsoluteUrlIfNeeded(value: string): string {
  if (!value.startsWith('/')) return value
  const baseUrl = getInternalBaseUrl()
  return `${baseUrl}${value}`
}

export function parseOpenAIImageDataUrl(value: string): { mimeType: string; base64: string } | null {
  const marker = ';base64,'
  const markerIndex = value.indexOf(marker)
  if (!value.startsWith('data:') || markerIndex === -1) return null
  const mimeType = value.slice(5, markerIndex)
  const base64 = value.slice(markerIndex + marker.length)
  if (!mimeType || !base64) return null
  return { mimeType, base64 }
}

export function readOpenAIStringOption(
  value: unknown,
  optionName: string,
  errorPrefix = 'OPENAI_COMPAT',
): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    throw new Error(`${errorPrefix}_OPTION_INVALID: ${optionName}`)
  }
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${errorPrefix}_OPTION_INVALID: ${optionName}`)
  }
  return trimmed
}

export async function toOpenAIUploadFile(imageSource: string, index: number): Promise<File> {
  const parsedDataUrl = parseOpenAIImageDataUrl(imageSource)
  if (parsedDataUrl) {
    const bytes = Buffer.from(parsedDataUrl.base64, 'base64')
    return await toFile(bytes, `reference-${index}.png`, { type: parsedDataUrl.mimeType })
  }

  if (imageSource.startsWith('http://') || imageSource.startsWith('https://') || imageSource.startsWith('/')) {
    const cachedDataUrl = await getImageBase64Cached(toAbsoluteUrlIfNeeded(imageSource))
    const parsedCached = parseOpenAIImageDataUrl(cachedDataUrl)
    if (!parsedCached) {
      throw new Error(`OPENAI_REFERENCE_INVALID: failed to parse image source ${index}`)
    }
    const bytes = Buffer.from(parsedCached.base64, 'base64')
    return await toFile(bytes, `reference-${index}.png`, { type: parsedCached.mimeType })
  }

  const bytes = Buffer.from(imageSource, 'base64')
  return await toFile(bytes, `reference-${index}.png`, { type: 'image/png' })
}

function readNumberOption(value: unknown, optionName: string, errorPrefix: string): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${errorPrefix}_OPTION_INVALID: ${optionName}`)
  }
  return value
}

function normalizeEnum<T extends string>(
  value: unknown,
  optionName: string,
  values: readonly T[],
  errorPrefix: string,
): T | undefined {
  const normalized = readOpenAIStringOption(value, optionName, errorPrefix)
  if (!normalized) return undefined
  if ((values as readonly string[]).includes(normalized)) return normalized as T
  throw new Error(`${errorPrefix}_IMAGE_OPTION_UNSUPPORTED: ${optionName}=${normalized}`)
}

function resolveRawSize(options: OpenAIImageProtocolOptions, errorPrefix: string): string | undefined {
  const size = readOpenAIStringOption(options.size, 'size', errorPrefix)
  const resolution = readOpenAIStringOption(options.resolution, 'resolution', errorPrefix)
  if (size && resolution && size !== resolution) {
    throw new Error(`${errorPrefix}_IMAGE_OPTION_CONFLICT: size and resolution must match`)
  }
  return size || resolution
}

function normalizeImageSize(
  value: string | undefined,
  sizes: readonly OpenAIImageGenerateSize[],
  errorPrefix: string,
): OpenAIImageGenerateSize | undefined {
  if (!value) return undefined
  if ((sizes as readonly string[]).includes(value)) return value as OpenAIImageGenerateSize
  throw new Error(`${errorPrefix}_IMAGE_OPTION_UNSUPPORTED: size=${value}`)
}

function toMimeFromOutputFormat(outputFormat: string | undefined): string {
  if (outputFormat === 'jpeg') return 'image/jpeg'
  if (outputFormat === 'webp') return 'image/webp'
  return 'image/png'
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

function assertAllowedOptions(input: {
  options: OpenAIImageProtocolOptions
  allowedKeys: ReadonlySet<string>
  errorPrefix: string
}) {
  for (const [key, value] of Object.entries(input.options)) {
    if (value === undefined) continue
    if (!input.allowedKeys.has(key)) {
      throw new Error(`${input.errorPrefix}_IMAGE_OPTION_UNSUPPORTED: ${key}`)
    }
  }
}

function assertFormatConstraints(input: {
  responseFormat: OpenAIImageResponseFormat | undefined
  outputFormat: OpenAIImageOutputFormat | undefined
  background: OpenAIImageBackground | undefined
  outputCompression: number | undefined
  supportsResponseFormat: boolean
  errorPrefix: string
}) {
  if (input.responseFormat && !input.supportsResponseFormat) {
    throw new Error(`${input.errorPrefix}_IMAGE_OPTION_UNSUPPORTED: responseFormat=${input.responseFormat}`)
  }
  if (input.outputCompression !== undefined) {
    if (input.outputCompression < 0 || input.outputCompression > 100) {
      throw new Error(`${input.errorPrefix}_IMAGE_OPTION_UNSUPPORTED: outputCompression=${input.outputCompression}`)
    }
    if (input.outputFormat !== 'jpeg' && input.outputFormat !== 'webp') {
      throw new Error(`${input.errorPrefix}_IMAGE_OPTION_UNSUPPORTED: outputCompression_requires_jpeg_or_webp`)
    }
  }
  if (input.background === 'transparent' && input.outputFormat === 'jpeg') {
    throw new Error(`${input.errorPrefix}_IMAGE_OPTION_UNSUPPORTED: transparent_background_requires_png_or_webp`)
  }
}

function toSafeOpenAIImageRequestError(params: {
  operation: 'generate' | 'edit'
  providerId: string
  modelId: string
  size: string | undefined
  responseFormat: OpenAIImageResponseFormat | undefined
  outputFormat: OpenAIImageOutputFormat | undefined
  quality: OpenAIImageGenerateQuality | undefined
  referenceImageCount: number
  cause: unknown
  errorPrefix: string
}): Error {
  const causeMessage = params.cause instanceof Error ? params.cause.message : String(params.cause)
  const responseFormatValue = params.responseFormat ? `response_format=${params.responseFormat}` : 'response_format=<unset>'
  const sizeValue = params.size ? `size=${params.size}` : 'size=<unset>'
  const outputFormatValue = params.outputFormat ? `output_format=${params.outputFormat}` : 'output_format=<unset>'
  const qualityValue = params.quality ? `quality=${params.quality}` : 'quality=<unset>'

  return new Error(
    [
      `${params.errorPrefix}_IMAGE_REQUEST_FAILED`,
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

export async function runOpenAIImageRequest(input: {
  client: OpenAI
  providerId: string
  modelId: string
  prompt: string
  referenceImages: string[]
  options: OpenAIImageProtocolOptions
  allowedKeys: ReadonlySet<string>
  allowedSizes: readonly OpenAIImageGenerateSize[]
  allowedQualities: readonly OpenAIImageGenerateQuality[]
  supportsResponseFormat: boolean
  errorPrefix: string
}): Promise<GenerateResult> {
  assertAllowedOptions({
    options: input.options,
    allowedKeys: input.allowedKeys,
    errorPrefix: input.errorPrefix,
  })
  const responseFormat = normalizeEnum(input.options.responseFormat, 'responseFormat', OPENAI_IMAGE_RESPONSE_FORMATS, input.errorPrefix)
  const outputFormat = normalizeEnum(input.options.outputFormat, 'outputFormat', OPENAI_IMAGE_OUTPUT_FORMATS, input.errorPrefix)
  const quality = normalizeEnum(input.options.quality, 'quality', input.allowedQualities, input.errorPrefix)
  const background = normalizeEnum(input.options.background, 'background', OPENAI_IMAGE_BACKGROUNDS, input.errorPrefix)
  const moderation = normalizeEnum(input.options.moderation, 'moderation', OPENAI_IMAGE_MODERATION_LEVELS, input.errorPrefix)
  const outputCompression = readNumberOption(input.options.outputCompression, 'outputCompression', input.errorPrefix)
  const rawSize = resolveRawSize(input.options, input.errorPrefix)
  const size = normalizeImageSize(rawSize, input.allowedSizes, input.errorPrefix)
  assertFormatConstraints({
    responseFormat,
    outputFormat,
    background,
    outputCompression,
    supportsResponseFormat: input.supportsResponseFormat,
    errorPrefix: input.errorPrefix,
  })

  let response: unknown
  const operation = input.referenceImages.length > 0 ? 'edit' as const : 'generate' as const
  try {
    if (operation === 'edit') {
      response = await input.client.images.edit({
        model: input.modelId,
        prompt: input.prompt,
        image: await Promise.all(input.referenceImages.map((image, index) => toOpenAIUploadFile(image, index))),
        ...(responseFormat && input.supportsResponseFormat ? { response_format: responseFormat } : {}),
        ...(outputFormat ? { output_format: outputFormat } : {}),
        ...(quality ? { quality } : {}),
        ...(size ? { size } : {}),
        ...(background ? { background } : {}),
        ...(outputCompression !== undefined ? { output_compression: outputCompression } : {}),
      } as unknown as Parameters<typeof input.client.images.edit>[0])
    } else {
      response = await input.client.images.generate({
        model: input.modelId,
        prompt: input.prompt,
        ...(responseFormat && input.supportsResponseFormat ? { response_format: responseFormat } : {}),
        ...(outputFormat ? { output_format: outputFormat } : {}),
        ...(quality ? { quality } : {}),
        ...(size ? { size } : {}),
        ...(background ? { background } : {}),
        ...(moderation ? { moderation } : {}),
        ...(outputCompression !== undefined ? { output_compression: outputCompression } : {}),
      } as unknown as Parameters<typeof input.client.images.generate>[0])
    }
  } catch (error) {
    throw toSafeOpenAIImageRequestError({
      operation,
      providerId: input.providerId,
      modelId: input.modelId,
      size,
      responseFormat,
      outputFormat,
      quality,
      referenceImageCount: input.referenceImages.length,
      errorPrefix: input.errorPrefix,
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
  throw new Error(`${input.errorPrefix}_IMAGE_EMPTY_RESPONSE: no image data returned`)
}
