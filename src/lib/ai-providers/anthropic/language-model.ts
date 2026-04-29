import { createAnthropic } from '@ai-sdk/anthropic'
import type { LanguageModel } from 'ai'
import type { AiProviderLanguageModelContext } from '@/lib/ai-providers/runtime-types'

export function createAnthropicLanguageModel(input: AiProviderLanguageModelContext): LanguageModel {
  const anthropic = createAnthropic({
    apiKey: input.providerConfig.apiKey,
    ...(input.providerConfig.baseUrl ? { baseURL: input.providerConfig.baseUrl } : {}),
    name: input.providerKey,
  })
  return anthropic.chat(input.selection.modelId)
}
