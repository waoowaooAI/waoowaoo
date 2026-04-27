import { runOpenAIBaseUrlLlmCompletion, runOpenAIBaseUrlLlmStream } from '@/lib/ai-providers/shared/openai-base-llm'
import type {
  AiProviderLlmResult,
  AiProviderLlmStreamContext,
} from '@/lib/ai-providers/runtime-types'

export async function runOpenRouterLlmCompletion(input: {
  modelId: string
  providerConfig: {
    apiKey: string
    baseUrl?: string
  }
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[]
  temperature: number
  reasoning: boolean
  reasoningEffort: 'minimal' | 'low' | 'medium' | 'high'
  maxRetries: number
}): Promise<AiProviderLlmResult> {
  if (!input.providerConfig.baseUrl) {
    throw new Error('PROVIDER_BASE_URL_MISSING: openrouter (llm)')
  }
  return await runOpenAIBaseUrlLlmCompletion({
    providerName: 'openrouter',
    providerKey: 'openrouter',
    modelId: input.modelId,
    baseUrl: input.providerConfig.baseUrl,
    apiKey: input.providerConfig.apiKey,
    messages: input.messages,
    temperature: input.temperature,
    reasoning: input.reasoning,
    reasoningEffort: input.reasoningEffort,
    maxRetries: input.maxRetries,
    isOpenRouter: true,
  })
}

export async function runOpenRouterLlmStream(input: AiProviderLlmStreamContext): Promise<AiProviderLlmResult> {
  return await runOpenAIBaseUrlLlmStream({
    ...input,
    providerName: 'openrouter',
    providerKey: 'openrouter',
    isOpenRouter: true,
  })
}
