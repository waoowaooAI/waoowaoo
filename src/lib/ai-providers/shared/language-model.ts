import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'
import type { AiProviderLanguageModelContext } from '@/lib/ai-providers/runtime-types'

export function createOpenAiSdkLanguageModel(input: AiProviderLanguageModelContext): LanguageModel {
  const openai = createOpenAI({
    apiKey: input.providerConfig.apiKey,
    ...(input.providerConfig.baseUrl ? { baseURL: input.providerConfig.baseUrl } : {}),
    name: input.providerKey,
  })
  return openai.chat(input.selection.modelId)
}
