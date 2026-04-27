import { createImageGenerator } from '@/lib/ai-providers/adapters/media/generators/factory'
import type { AiProviderImageExecutionContext } from '@/lib/ai-providers/runtime-types'

export async function executeFalImageGeneration(input: AiProviderImageExecutionContext) {
  const generator = createImageGenerator(input.selection.provider, input.selection.modelId)
  return await generator.generate({
    userId: input.userId,
    prompt: input.prompt,
    referenceImages: input.options?.referenceImages,
    options: {
      ...(input.options || {}),
      provider: input.selection.provider,
      modelId: input.selection.modelId,
      modelKey: input.selection.modelKey,
    },
  })
}
