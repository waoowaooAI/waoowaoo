import {
  assertOfficialModelRegistered,
  type OfficialModelModality,
} from '@/lib/providers/official/model-registry'
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
