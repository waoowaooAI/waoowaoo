import type { AiProviderImageExecutionContext } from '@/lib/ai-providers/runtime-types'
import type { BailianGenerateRequestOptions } from './types'
import { assertBailianOfficialModelSupported } from './models'

export interface BailianImageGenerateParams {
  userId: string
  prompt: string
  referenceImages?: string[]
  options: BailianGenerateRequestOptions
}

function assertRegistered(modelId: string): void {
  assertBailianOfficialModelSupported('image', modelId)
}

export async function generateBailianImage(params: BailianImageGenerateParams): Promise<never> {
  assertRegistered(params.options.modelId)
  throw new Error('OFFICIAL_PROVIDER_NOT_IMPLEMENTED: bailian image')
}

export async function executeBailianImageGeneration(input: AiProviderImageExecutionContext) {
  return await generateBailianImage({
    userId: input.userId,
    prompt: input.prompt,
    referenceImages: input.options?.referenceImages,
    options: {
      ...(input.options || {}),
      provider: input.selection.provider,
      modelId: input.selection.modelId,
      modelKey: input.selection.modelKey,
    } as BailianGenerateRequestOptions,
  })
}
