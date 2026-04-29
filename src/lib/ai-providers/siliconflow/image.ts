import type { AiProviderImageExecutionContext } from '@/lib/ai-providers/runtime-types'
import type { SiliconFlowGenerateRequestOptions } from './types'
import { assertSiliconFlowOfficialModelSupported } from './models'

export interface SiliconFlowImageGenerateParams {
  userId: string
  prompt: string
  referenceImages?: string[]
  options: SiliconFlowGenerateRequestOptions
}

function assertRegistered(modelId: string): void {
  assertSiliconFlowOfficialModelSupported('image', modelId)
}

export async function generateSiliconFlowImage(params: SiliconFlowImageGenerateParams): Promise<never> {
  assertRegistered(params.options.modelId)
  throw new Error('OFFICIAL_PROVIDER_NOT_IMPLEMENTED: siliconflow image')
}

export async function executeSiliconFlowImageGeneration(input: AiProviderImageExecutionContext) {
  return await generateSiliconFlowImage({
    userId: input.userId,
    prompt: input.prompt,
    referenceImages: input.options?.referenceImages,
    options: {
      ...(input.options || {}),
      provider: input.selection.provider,
      modelId: input.selection.modelId,
      modelKey: input.selection.modelKey,
    } as SiliconFlowGenerateRequestOptions,
  })
}
