import {
  assertOfficialModelRegistered,
  type OfficialModelModality,
} from '@/lib/providers/official/model-registry'
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
