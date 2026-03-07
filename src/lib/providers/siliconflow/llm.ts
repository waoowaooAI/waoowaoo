import type OpenAI from 'openai'
import {
  assertOfficialModelRegistered,
  type OfficialModelModality,
} from '@/lib/providers/official/model-registry'
import { ensureSiliconFlowCatalogRegistered } from './catalog'
import type { SiliconFlowLlmMessage } from './types'

export interface SiliconFlowLlmCompletionParams {
  modelId: string
  messages: SiliconFlowLlmMessage[]
  apiKey: string
  baseUrl?: string
  temperature?: number
}

function assertRegistered(modelId: string): void {
  ensureSiliconFlowCatalogRegistered()
  assertOfficialModelRegistered({
    provider: 'siliconflow',
    modality: 'llm' satisfies OfficialModelModality,
    modelId,
  })
}

export async function completeSiliconFlowLlm(
  params: SiliconFlowLlmCompletionParams,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  assertRegistered(params.modelId)
  throw new Error('OFFICIAL_PROVIDER_NOT_IMPLEMENTED: siliconflow llm')
}
