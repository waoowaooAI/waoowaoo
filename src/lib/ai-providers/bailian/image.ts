import {
  assertOfficialModelRegistered,
  type OfficialModelModality,
} from '@/lib/ai-providers/official/model-registry'
import type { AiProviderImageExecutionContext } from '@/lib/ai-providers/runtime-types'
import { ensureBailianCatalogRegistered } from './catalog'
import type { BailianGenerateRequestOptions } from './types'

export interface BailianImageGenerateParams {
  userId: string
  prompt: string
  referenceImages?: string[]
  options: BailianGenerateRequestOptions
}

function assertRegistered(modelId: string): void {
  ensureBailianCatalogRegistered()
  assertOfficialModelRegistered({
    provider: 'bailian',
    modality: 'image' satisfies OfficialModelModality,
    modelId,
  })
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
