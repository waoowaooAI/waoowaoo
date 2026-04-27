import {
  assertOfficialModelRegistered,
  type OfficialModelModality,
} from '@/lib/ai-providers/official/model-registry'
import type { AiProviderVideoExecutionContext } from '@/lib/ai-providers/runtime-types'
import { ensureSiliconFlowCatalogRegistered } from './catalog'
import type { SiliconFlowGenerateRequestOptions } from './types'

export interface SiliconFlowVideoGenerateParams {
  userId: string
  imageUrl: string
  prompt?: string
  options: SiliconFlowGenerateRequestOptions
}

function assertRegistered(modelId: string): void {
  ensureSiliconFlowCatalogRegistered()
  assertOfficialModelRegistered({
    provider: 'siliconflow',
    modality: 'video' satisfies OfficialModelModality,
    modelId,
  })
}

export async function generateSiliconFlowVideo(params: SiliconFlowVideoGenerateParams): Promise<never> {
  assertRegistered(params.options.modelId)
  throw new Error('OFFICIAL_PROVIDER_NOT_IMPLEMENTED: siliconflow video')
}

export async function executeSiliconFlowVideoGeneration(input: AiProviderVideoExecutionContext) {
  return await generateSiliconFlowVideo({
    userId: input.userId,
    imageUrl: input.imageUrl,
    prompt: input.options?.prompt,
    options: {
      ...(input.options || {}),
      provider: input.selection.provider,
      modelId: input.selection.modelId,
      modelKey: input.selection.modelKey,
    } as SiliconFlowGenerateRequestOptions,
  })
}
