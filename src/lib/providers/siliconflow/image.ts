import {
  assertOfficialModelRegistered,
  type OfficialModelModality,
} from '@/lib/providers/official/model-registry'
import { ensureSiliconFlowCatalogRegistered } from './catalog'
import type { SiliconFlowGenerateRequestOptions } from './types'

export interface SiliconFlowImageGenerateParams {
  userId: string
  prompt: string
  referenceImages?: string[]
  options: SiliconFlowGenerateRequestOptions
}

function assertRegistered(modelId: string): void {
  ensureSiliconFlowCatalogRegistered()
  assertOfficialModelRegistered({
    provider: 'siliconflow',
    modality: 'image' satisfies OfficialModelModality,
    modelId,
  })
}

export async function generateSiliconFlowImage(params: SiliconFlowImageGenerateParams): Promise<never> {
  assertRegistered(params.options.modelId)
  throw new Error('OFFICIAL_PROVIDER_NOT_IMPLEMENTED: siliconflow image')
}
