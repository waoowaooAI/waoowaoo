import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from '@google/genai'
import { getProviderKey } from '@/lib/ai-registry/selection'
import { getProviderConfig } from '@/lib/user-api/runtime-config'
import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'
import type { AiProviderImageExecutionContext, GenerateResult } from '@/lib/ai-providers/runtime-types'
import { setProxy } from '../../../../lib/prompts/proxy'

type ContentPart = { inlineData: { mimeType: string; data: string } } | { text: string }

type GoogleImageOptions = NonNullable<AiProviderImageExecutionContext['options']>

type ImagenResponse = {
  generatedImages?: Array<{
    image?: {
      imageBytes?: string
    }
  }>
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

function normalizeGeminiImageSize(value: string | undefined): string | undefined {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) return undefined
  if (normalized === '0.5K') return '512'
  return normalized
}

function assertAllowedGoogleImageOptions(options: GoogleImageOptions) {
  const allowedOptionKeys = new Set([
    'provider',
    'modelId',
    'modelKey',
    'aspectRatio',
    'resolution',
    'referenceImages',
  ])
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue
    if (!allowedOptionKeys.has(key)) {
      throw new Error(`GOOGLE_IMAGE_OPTION_UNSUPPORTED: ${key}`)
    }
  }
}

async function toInlineData(imageSource: string): Promise<{ mimeType: string; data: string } | null> {
  const parsedDataUrl = parseDataUrl(imageSource)
  if (parsedDataUrl) {
    return { mimeType: parsedDataUrl.mimeType, data: parsedDataUrl.base64 }
  }

  const base64DataUrl = imageSource.startsWith('data:') ? imageSource : await normalizeToBase64ForGeneration(imageSource)
  const parsedNormalized = parseDataUrl(base64DataUrl)
  if (!parsedNormalized) return null
  return { mimeType: parsedNormalized.mimeType, data: parsedNormalized.base64 }
}

async function executeGeminiCompatibleImageGeneration(input: AiProviderImageExecutionContext): Promise<GenerateResult> {
  const options: GoogleImageOptions = input.options ?? {}
  assertAllowedGoogleImageOptions(options)

  const providerConfig = await getProviderConfig(input.userId, input.selection.provider)
  if (!providerConfig.baseUrl) {
    throw new Error(`PROVIDER_BASE_URL_MISSING: ${input.selection.provider}`)
  }
  await setProxy()

  const ai = new GoogleGenAI({
    apiKey: providerConfig.apiKey,
    httpOptions: { baseUrl: providerConfig.baseUrl },
  })

  const parts: ContentPart[] = []
  const imageSize = normalizeGeminiImageSize(options.resolution)

  for (const referenceImage of (options.referenceImages ?? []).slice(0, 14)) {
    const inlineData = await toInlineData(referenceImage)
    if (!inlineData) {
      throw new Error('GEMINI_COMPATIBLE_REFERENCE_INVALID: failed to parse reference image')
    }
    parts.push({ inlineData })
  }
  parts.push({ text: input.prompt })

  const response = await ai.models.generateContent({
    model: input.selection.modelId || 'gemini-2.5-flash-image-preview',
    contents: [{ parts }],
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
      ...(options.aspectRatio || options.resolution
        ? {
          imageConfig: {
            ...(options.aspectRatio ? { aspectRatio: options.aspectRatio } : {}),
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

async function executeGoogleImageGenerationInternal(input: AiProviderImageExecutionContext): Promise<GenerateResult> {
  const options: GoogleImageOptions = input.options ?? {}
  assertAllowedGoogleImageOptions(options)

  const { apiKey } = await getProviderConfig(input.userId, input.selection.provider)
  await setProxy()
  const ai = new GoogleGenAI({ apiKey })

  const modelId = input.selection.modelId || 'gemini-3-pro-image-preview'
  const referenceImages = options.referenceImages ?? []

  if (modelId === 'gemini-3-pro-image-preview-batch') {
    const { submitGeminiBatch } = await import('@/lib/ai-providers/google/llm')
    const result = await submitGeminiBatch(apiKey, input.prompt, {
      referenceImages,
      ...(options.aspectRatio ? { aspectRatio: options.aspectRatio } : {}),
      ...(options.resolution ? { resolution: options.resolution } : {}),
    })

    if (!result.success || !result.batchName) {
      return { success: false, error: result.error || 'Gemini Batch 提交失败' }
    }

    return {
      success: true,
      async: true,
      requestId: result.batchName,
      externalId: `GEMINI:BATCH:${result.batchName}`,
    }
  }

  if (modelId.startsWith('imagen-')) {
    const response = await ai.models.generateImages({
      model: modelId,
      prompt: input.prompt,
      config: {
        numberOfImages: 1,
        ...(options.aspectRatio ? { aspectRatio: options.aspectRatio } : {}),
      },
    })

    const generatedImages = (response as ImagenResponse).generatedImages
    const imageBytes = generatedImages?.[0]?.image?.imageBytes
    if (!imageBytes) {
      throw new Error('Imagen 未返回图片')
    }
    return {
      success: true,
      imageBase64: imageBytes,
      imageUrl: `data:image/png;base64,${imageBytes}`,
    }
  }

  const contentParts: ContentPart[] = []
  for (const imageSource of referenceImages.slice(0, 14)) {
    const inlineData = await toInlineData(imageSource)
    if (inlineData) contentParts.push({ inlineData })
  }
  contentParts.push({ text: input.prompt })

  const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  ]

  const response = await ai.models.generateContent({
    model: modelId,
    contents: [{ parts: contentParts }],
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
      safetySettings,
      ...(options.aspectRatio || options.resolution
        ? {
          imageConfig: {
            ...(options.aspectRatio ? { aspectRatio: options.aspectRatio } : {}),
            ...(options.resolution ? { imageSize: options.resolution } : {}),
          },
        }
        : {}),
    },
  })

  const candidate = response.candidates?.[0]
  const parts = candidate?.content?.parts || []
  for (const part of parts) {
    if (part.inlineData?.data) {
      const imageBase64 = part.inlineData.data
      const mimeType = part.inlineData.mimeType || 'image/png'
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

  throw new Error('Gemini 未返回图片')
}

export async function executeGoogleImageGeneration(input: AiProviderImageExecutionContext): Promise<GenerateResult> {
  const providerKey = getProviderKey(input.selection.provider).toLowerCase()
  if (providerKey === 'gemini-compatible') {
    return await executeGeminiCompatibleImageGeneration(input)
  }
  return await executeGoogleImageGenerationInternal(input)
}
