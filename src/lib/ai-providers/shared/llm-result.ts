import type OpenAI from 'openai'
import type { AiLlmExecutionResult } from '@/lib/ai-registry/types'
import { completionUsageSummary } from '@/lib/ai-providers/shared/llm-support'

export function buildAiProviderLlmResult(input: {
  completion: OpenAI.Chat.Completions.ChatCompletion
  logProvider: string
  text: string
  reasoning: string
  usage?: { promptTokens: number; completionTokens: number } | null
  successDetails?: { [key: string]: unknown }
}): Pick<
  AiLlmExecutionResult,
  'completion' | 'logProvider' | 'text' | 'reasoning' | 'usage' | 'successDetails'
> {
  return {
    completion: input.completion,
    logProvider: input.logProvider,
    text: input.text,
    reasoning: input.reasoning,
    usage: input.usage ?? completionUsageSummary(input.completion),
    successDetails: input.successDetails,
  }
}
