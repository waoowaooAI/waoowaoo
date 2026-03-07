import OpenAI from 'openai'
import {
  assertOfficialModelRegistered,
  type OfficialModelModality,
} from '@/lib/providers/official/model-registry'
import { ensureBailianCatalogRegistered } from './catalog'
import type { BailianLlmMessage } from './types'

export interface BailianLlmCompletionParams {
  modelId: string
  messages: BailianLlmMessage[]
  apiKey: string
  baseUrl?: string
  temperature?: number
}

function assertRegistered(modelId: string): void {
  ensureBailianCatalogRegistered()
  assertOfficialModelRegistered({
    provider: 'bailian',
    modality: 'llm' satisfies OfficialModelModality,
    modelId,
  })
}

export async function completeBailianLlm(
  _params: BailianLlmCompletionParams,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  assertRegistered(_params.modelId)
  const baseURL = typeof _params.baseUrl === 'string' && _params.baseUrl.trim()
    ? _params.baseUrl.trim()
    : 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  const client = new OpenAI({
    apiKey: _params.apiKey,
    baseURL,
    timeout: 30_000,
  })
  const completion = await client.chat.completions.create({
    model: _params.modelId,
    messages: _params.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    temperature: _params.temperature ?? 0.7,
  })
  return completion as OpenAI.Chat.Completions.ChatCompletion
}
