import type { AiProviderAdapter } from '@/lib/ai-providers/runtime-types'
import { createOpenAiSdkLanguageModel } from '@/lib/ai-providers/shared/language-model'
import { runOpenRouterLlmCompletion, runOpenRouterLlmStream } from './llm'

export const openRouterAdapter: AiProviderAdapter = {
  providerKey: 'openrouter',
  completeLlm: (input) => runOpenRouterLlmCompletion({
    modelId: input.selection.modelId,
    providerConfig: input.providerConfig,
    messages: input.messages,
    temperature: input.temperature,
    reasoning: input.reasoning,
    reasoningEffort: input.reasoningEffort,
    maxRetries: input.maxRetries,
  }),
  languageModel: {
    create: createOpenAiSdkLanguageModel,
  },
  streamLlm: runOpenRouterLlmStream,
}
