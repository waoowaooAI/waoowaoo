import type { AiProviderAdapter } from '@/lib/ai-providers/runtime-types'
import { createAnthropicLanguageModel } from './language-model'

export const anthropicAdapter: AiProviderAdapter = {
  providerKey: 'anthropic',
  languageModel: {
    create: createAnthropicLanguageModel,
  },
}
