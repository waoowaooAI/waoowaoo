import {
  assertOfficialModelRegistered,
  type OfficialModelModality,
} from '@/lib/providers/official/model-registry'
import { ensureSiliconFlowCatalogRegistered } from './catalog'
import type { SiliconFlowGenerateRequestOptions } from './types'

export interface SiliconFlowAudioGenerateParams {
  userId: string
  text: string
  voice?: string
  rate?: number
  options: SiliconFlowGenerateRequestOptions
}

function assertRegistered(modelId: string): void {
  ensureSiliconFlowCatalogRegistered()
  assertOfficialModelRegistered({
    provider: 'siliconflow',
    modality: 'audio' satisfies OfficialModelModality,
    modelId,
  })
}

export async function generateSiliconFlowAudio(params: SiliconFlowAudioGenerateParams): Promise<never> {
  assertRegistered(params.options.modelId)
  throw new Error('OFFICIAL_PROVIDER_NOT_IMPLEMENTED: siliconflow audio')
}
