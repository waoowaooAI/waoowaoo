import { createVideoGenerator } from '@/lib/ai-providers/adapters/media/generators/factory'
import type { AiProviderVideoExecutionContext } from '@/lib/ai-providers/runtime-types'

export async function executeMinimaxVideoGeneration(input: AiProviderVideoExecutionContext) {
  const { prompt, ...providerOptions } = input.options || {}
  const generator = createVideoGenerator(input.selection.provider)
  return await generator.generate({
    userId: input.userId,
    imageUrl: input.imageUrl,
    prompt,
    options: {
      ...providerOptions,
      provider: input.selection.provider,
      modelId: input.selection.modelId,
      modelKey: input.selection.modelKey,
    },
  })
}
