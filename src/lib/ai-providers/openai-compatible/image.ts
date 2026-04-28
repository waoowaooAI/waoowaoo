import {
  generateImageViaOpenAICompat,
  generateImageViaOpenAICompatTemplate,
} from '@/lib/ai-providers/adapters/openai-compatible/index'
import type { AiProviderImageExecutionContext } from '@/lib/ai-providers/runtime-types'
import type { OpenAICompatMediaTemplate } from '@/lib/ai-providers/openai-compatible/user-template'

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
  const { referenceImages, ...generatorOptions } = input.options || {}
  const compatTemplate = input.selection.compatMediaTemplate as OpenAICompatMediaTemplate | undefined
  if (!compatTemplate) {
    throw new Error(`MODEL_COMPAT_MEDIA_TEMPLATE_REQUIRED: ${input.selection.modelKey}`)
  }
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
    },
    profile: 'openai-compatible',
  })
}
