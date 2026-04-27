import {
  assertOfficialModelRegistered,
  type OfficialModelModality,
} from '@/lib/ai-providers/official/model-registry'
import type { AiProviderAudioExecutionContext } from '@/lib/ai-providers/runtime-types'
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

export async function executeSiliconFlowAudioGeneration(input: AiProviderAudioExecutionContext) {
  return await generateSiliconFlowAudio({
    userId: input.userId,
    text: input.text,
    voice: input.options?.voice,
    rate: input.options?.rate,
    options: {
      provider: input.selection.provider,
      modelId: input.selection.modelId,
      modelKey: input.selection.modelKey,
    } as SiliconFlowGenerateRequestOptions,
  })
}
