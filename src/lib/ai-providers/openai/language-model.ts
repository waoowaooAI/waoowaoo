import type { LanguageModel } from 'ai'
import type { AiProviderLanguageModelContext } from '@/lib/ai-providers/runtime-types'
import { createOpenAiSdkLanguageModel } from '@/lib/ai-providers/shared/language-model'

export function createOpenAiLanguageModel(input: AiProviderLanguageModelContext): LanguageModel {
  return createOpenAiSdkLanguageModel(input)
}
