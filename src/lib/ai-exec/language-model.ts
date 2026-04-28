import type { LanguageModel } from 'ai'
import { createRegisteredLanguageModel } from '@/lib/ai-providers'
import type { AiProviderLanguageModelContext } from '@/lib/ai-providers/runtime-types'

export function createAiLanguageModel(input: AiProviderLanguageModelContext): LanguageModel {
  return createRegisteredLanguageModel(input)
}
