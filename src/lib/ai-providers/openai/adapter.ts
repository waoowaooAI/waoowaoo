import type { AiProviderAdapter } from '@/lib/ai-providers/runtime-types'
import { createOpenAiLanguageModel } from './language-model'

export const openAiAdapter: AiProviderAdapter = {
  providerKey: 'openai',
  languageModel: {
    create: createOpenAiLanguageModel,
  },
}
