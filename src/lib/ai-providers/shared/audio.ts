import { createAudioGenerator } from '@/lib/ai-providers/adapters/media/generators/factory'
import type { AiProviderAudioExecutionContext } from '@/lib/ai-providers/runtime-types'

export async function executeGenericAudioGeneration(input: AiProviderAudioExecutionContext) {
  const generator = createAudioGenerator(input.selection.provider)
  return await generator.generate({
    userId: input.userId,
    text: input.text,
    voice: input.options?.voice,
    rate: input.options?.rate,
    options: {
      provider: input.selection.provider,
      modelId: input.selection.modelId,
      modelKey: input.selection.modelKey,
    },
  })
}
