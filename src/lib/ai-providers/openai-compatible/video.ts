import {
  generateVideoViaOpenAICompat,
  generateVideoViaOpenAICompatTemplate,
} from '@/lib/ai-providers/adapters/openai-compatible/index'
import type { AiProviderVideoExecutionContext } from '@/lib/ai-providers/runtime-types'
import type { OpenAICompatMediaTemplate } from '@/lib/ai-providers/openai-compatible/user-template'

export async function executeOpenAiCompatibleVideoGeneration(input: AiProviderVideoExecutionContext) {
  const { prompt, ...providerOptions } = input.options || {}
  const compatTemplate = input.selection.compatMediaTemplate as OpenAICompatMediaTemplate | undefined
  if (!compatTemplate) {
    throw new Error(`MODEL_COMPAT_MEDIA_TEMPLATE_REQUIRED: ${input.selection.modelKey}`)
  }
  if (compatTemplate) {
    return await generateVideoViaOpenAICompatTemplate({
      userId: input.userId,
      providerId: input.selection.provider,
      modelId: input.selection.modelId,
      modelKey: input.selection.modelKey,
      imageUrl: input.imageUrl,
      prompt: prompt || '',
      options: {
        ...providerOptions,
        provider: input.selection.provider,
        modelId: input.selection.modelId,
        modelKey: input.selection.modelKey,
      },
      profile: 'openai-compatible',
      template: compatTemplate,
    })
  }

  return await generateVideoViaOpenAICompat({
    userId: input.userId,
    providerId: input.selection.provider,
    modelId: input.selection.modelId,
    modelKey: input.selection.modelKey,
    imageUrl: input.imageUrl,
    prompt: prompt || '',
    options: {
      ...providerOptions,
      provider: input.selection.provider,
      modelId: input.selection.modelId,
      modelKey: input.selection.modelKey,
    },
    profile: 'openai-compatible',
  })
}
