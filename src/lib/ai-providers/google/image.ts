import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from '@google/genai'
import { getProviderConfig } from '@/lib/user-api/runtime-config'
import type { AiProviderImageExecutionContext, GenerateResult } from '@/lib/ai-providers/runtime-types'
import {
  assertAllowedGoogleImageOptions,
  normalizeGeminiImageSize,
  toGoogleInlineData,
  type GoogleContentPart,
} from '@/lib/ai-providers/shared/google-image-helpers'
import { requireSelectedModelId } from '@/lib/ai-providers/shared/model-selection'
import { setProxy } from '../../../../lib/prompts/proxy'

type GoogleImageOptions = NonNullable<AiProviderImageExecutionContext['options']>

type ImagenResponse = {
  generatedImages?: Array<{
    image?: {
      imageBytes?: string
    }
  }>
}

export async function executeGeminiCompatibleImageGeneration(
  input: AiProviderImageExecutionContext,
): Promise<GenerateResult> {
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

  const parts: GoogleContentPart[] = []
  const imageSize = normalizeGeminiImageSize(options.resolution)

  for (const referenceImage of (options.referenceImages ?? []).slice(0, 14)) {
    const inlineData = await toGoogleInlineData(referenceImage)
    if (!inlineData) {
      throw new Error('GEMINI_COMPATIBLE_REFERENCE_INVALID: failed to parse reference image')
    }
    parts.push({ inlineData })
  }
  parts.push({ text: input.prompt })

  const modelId = requireSelectedModelId(input.selection, 'gemini-compatible:image')

  const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  ]

  const response = await ai.models.generateContent({
    model: modelId,
    contents: [{ parts }],
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
      safetySettings,
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

  const modelId = requireSelectedModelId(input.selection, 'google:image')
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

  const contentParts: GoogleContentPart[] = []
  for (const imageSource of referenceImages.slice(0, 14)) {
    const inlineData = await toGoogleInlineData(imageSource)
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
  return await executeGoogleImageGenerationInternal(input)
}
