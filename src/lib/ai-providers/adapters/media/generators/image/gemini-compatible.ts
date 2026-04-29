import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from '@google/genai'
import { getProviderConfig } from '@/lib/api-config'
import { getInternalBaseUrl } from '@/lib/env'
import { getImageBase64Cached } from '@/lib/image-cache'
import { BaseImageGenerator, type GenerateResult, type ImageGenerateParams } from '../base'
import { setProxy } from '../../../../../../../lib/prompts/proxy'

type GeminiCompatibleContentPart = { inlineData: { mimeType: string; data: string } } | { text: string }

type GeminiCompatibleOptions = {
  aspectRatio?: string
  resolution?: string
  provider?: string
  modelId?: string
  modelKey?: string
}

function toAbsoluteUrlIfNeeded(value: string): string {
  if (!value.startsWith('/')) return value
  const baseUrl = getInternalBaseUrl()
  return `${baseUrl}${value}`
}

function parseDataUrl(value: string): { mimeType: string; base64: string } | null {
  const marker = ';base64,'
  const markerIndex = value.indexOf(marker)
  if (!value.startsWith('data:') || markerIndex === -1) return null
  const mimeType = value.slice(5, markerIndex)
  const base64 = value.slice(markerIndex + marker.length)
  if (!mimeType || !base64) return null
  return { mimeType, base64 }
}

async function toInlineData(imageSource: string): Promise<{ mimeType: string; data: string } | null> {
  const parsedDataUrl = parseDataUrl(imageSource)
  if (parsedDataUrl) {
    return { mimeType: parsedDataUrl.mimeType, data: parsedDataUrl.base64 }
  }

  if (imageSource.startsWith('http://') || imageSource.startsWith('https://') || imageSource.startsWith('/')) {
    const cachedDataUrl = await getImageBase64Cached(toAbsoluteUrlIfNeeded(imageSource))
    const parsedCachedDataUrl = parseDataUrl(cachedDataUrl)
    if (!parsedCachedDataUrl) return null
    return { mimeType: parsedCachedDataUrl.mimeType, data: parsedCachedDataUrl.base64 }
  }

  return { mimeType: 'image/png', data: imageSource }
}

function assertAllowedOptions(options: Record<string, unknown>) {
  const allowedKeys = new Set([
    'provider',
    'modelId',
    'modelKey',
    'aspectRatio',
    'resolution',
  ])
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue
    if (!allowedKeys.has(key)) {
      throw new Error(`GEMINI_COMPATIBLE_IMAGE_OPTION_UNSUPPORTED: ${key}`)
    }
  }
}

function normalizeGeminiImageSize(input: string | undefined): string | undefined {
  if (!input) return undefined
  const normalized = input.trim()
  if (!normalized) return undefined
  const lower = normalized.toLowerCase()
  // Yunwu / Gemini: 0.5K must be sent as "512"
  if (lower === '0.5k' || lower === '0_5k') return '512'
  if (lower === '512' || lower === '512px' || lower === '512x512') return '512'
  if (lower === '1k' || lower === '1024' || lower === '1024px' || lower === '1024x1024') return '1K'
  if (lower === '2k' || lower === '2048' || lower === '2048px') return '2K'
  if (lower === '4k' || lower === '4096' || lower === '4096px') return '4K'
  return normalized
}

export class GeminiCompatibleImageGenerator extends BaseImageGenerator {
  private readonly modelId?: string
  private readonly providerId?: string

  constructor(modelId?: string, providerId?: string) {
    super()
    this.modelId = modelId
    this.providerId = providerId
  }

  protected async doGenerate(params: ImageGenerateParams): Promise<GenerateResult> {
    const { userId, prompt, referenceImages = [], options = {} } = params
    assertAllowedOptions(options)

    const providerId = this.providerId || 'gemini-compatible'
    const providerConfig = await getProviderConfig(userId, providerId)
    if (!providerConfig.baseUrl) {
      throw new Error(`PROVIDER_BASE_URL_MISSING: ${providerId}`)
    }
    await setProxy()

    const ai = new GoogleGenAI({
      apiKey: providerConfig.apiKey,
      httpOptions: { baseUrl: providerConfig.baseUrl },
    })
    const normalizedOptions = options as GeminiCompatibleOptions
    const imageSize = normalizeGeminiImageSize(normalizedOptions.resolution)
    const parts: GeminiCompatibleContentPart[] = []

    for (const referenceImage of referenceImages.slice(0, 14)) {
      const inlineData = await toInlineData(referenceImage)
      if (!inlineData) {
        throw new Error('GEMINI_COMPATIBLE_REFERENCE_INVALID: failed to parse reference image')
      }
      parts.push({ inlineData })
    }
    parts.push({ text: prompt })

    const response = await ai.models.generateContent({
      model: this.modelId || normalizedOptions.modelId || 'gemini-2.5-flash-image-preview',
      contents: [{ parts }],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ],
        ...(normalizedOptions.aspectRatio || imageSize
          ? {
            imageConfig: {
              ...(normalizedOptions.aspectRatio ? { aspectRatio: normalizedOptions.aspectRatio } : {}),
              ...(imageSize ? { imageSize } : {}),
            },
          }
          : {}),
      },
    })

    const candidate = response.candidates?.[0]
    const responseParts = candidate?.content?.parts || []
    for (const part of responseParts) {
      if (part.inlineData?.data) {
        const mimeType = part.inlineData.mimeType || 'image/png'
        const imageBase64 = part.inlineData.data
        return {
          success: true,
          imageBase64,
          imageUrl: `data:${mimeType};base64,${imageBase64}`,
        }
      }
    }

    const finishReason = candidate?.finishReason
    if (finishReason === 'IMAGE_SAFETY' || finishReason === 'SAFETY') {
      throw new Error('内容因安全策略被过滤')
    }

    throw new Error('GEMINI_COMPATIBLE_IMAGE_EMPTY_RESPONSE: no image data returned')
  }
}
