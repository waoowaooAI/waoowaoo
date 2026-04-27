import {
  runOpenAICompatChatCompletion,
  runOpenAICompatResponsesCompletion,
} from '@/lib/ai-providers/adapters/openai-compatible/index'
import { getCompletionParts } from '@/lib/ai-providers/shared/completion-parts'
import { buildAiProviderLlmResult } from '@/lib/ai-providers/shared/llm-result'
import { emitStreamChunk, emitStreamStage, resolveStreamStepMeta } from '@/lib/ai-providers/shared/llm-support'
import { runOpenAIBaseUrlLlmCompletion, runOpenAIBaseUrlLlmStream } from '@/lib/ai-providers/shared/openai-base-llm'
import type {
  AiProviderLlmResult,
  AiProviderLlmStreamContext,
} from '@/lib/ai-providers/runtime-types'

export async function runOpenAiCompatibleLlmCompletion(input: {
  gatewayRoute: 'official' | 'openai-compat'
  userId: string
  providerId: string
  modelId: string
  llmProtocol?: 'responses' | 'chat-completions'
  providerConfig: {
    apiKey: string
    baseUrl?: string
    apiMode?: 'gemini-sdk' | 'openai-official'
  }
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[]
  temperature: number
  reasoning: boolean
  reasoningEffort: 'minimal' | 'low' | 'medium' | 'high'
  maxRetries: number
}): Promise<AiProviderLlmResult> {
  if (input.gatewayRoute === 'openai-compat') {
    if (!input.llmProtocol) {
      throw new Error(`MODEL_LLM_PROTOCOL_REQUIRED: ${input.providerId}::${input.modelId}`)
    }
    const completion = input.llmProtocol === 'responses'
      ? await runOpenAICompatResponsesCompletion({
        userId: input.userId,
        providerId: input.providerId,
        modelId: input.modelId,
        messages: input.messages,
        temperature: input.temperature,
      })
      : await runOpenAICompatChatCompletion({
        userId: input.userId,
        providerId: input.providerId,
        modelId: input.modelId,
        messages: input.messages,
        temperature: input.temperature,
      })
    const completionParts = getCompletionParts(completion)
    return buildAiProviderLlmResult({
      completion,
      logProvider: input.llmProtocol === 'responses' ? 'openai_compat_responses' : 'openai_compat_chat_completions',
      text: completionParts.text,
      reasoning: completionParts.reasoning,
      successDetails: { llmProtocol: input.llmProtocol },
    })
  }

  if (!input.providerConfig.baseUrl) {
    throw new Error(`PROVIDER_BASE_URL_MISSING: ${input.providerId} (llm)`)
  }
  return await runOpenAIBaseUrlLlmCompletion({
    providerName: 'openai_compatible',
    providerKey: 'openai-compatible',
    modelId: input.modelId,
    baseUrl: input.providerConfig.baseUrl,
    apiKey: input.providerConfig.apiKey,
    apiMode: input.providerConfig.apiMode,
    messages: input.messages,
    temperature: input.temperature,
    reasoning: input.reasoning,
    reasoningEffort: input.reasoningEffort,
    maxRetries: input.maxRetries,
  })
}

export async function runOpenAiCompatibleLlmStream(
  input: AiProviderLlmStreamContext & { gatewayRoute: 'official' | 'openai-compat' },
): Promise<AiProviderLlmResult> {
  if (input.gatewayRoute === 'openai-compat') {
    const stepMeta = resolveStreamStepMeta(input.options)
    if (!input.selection.llmProtocol) {
      throw new Error(`MODEL_LLM_PROTOCOL_REQUIRED: ${input.selection.modelKey}`)
    }
    emitStreamStage(input.callbacks, stepMeta, 'streaming', 'openai-compat')
    const completion = input.selection.llmProtocol === 'responses'
      ? await runOpenAICompatResponsesCompletion({
        userId: input.userId,
        providerId: input.selection.provider,
        modelId: input.selection.modelId,
        messages: input.messages,
        temperature: input.options.temperature ?? 0.7,
      })
      : await runOpenAICompatChatCompletion({
        userId: input.userId,
        providerId: input.selection.provider,
        modelId: input.selection.modelId,
        messages: input.messages,
        temperature: input.options.temperature ?? 0.7,
      })
    const completionParts = getCompletionParts(completion)
    let seq = 1
    if (completionParts.reasoning) {
      emitStreamChunk(input.callbacks, stepMeta, {
        kind: 'reasoning',
        delta: completionParts.reasoning,
        seq,
        lane: 'reasoning',
      })
      seq += 1
    }
    if (completionParts.text) {
      emitStreamChunk(input.callbacks, stepMeta, {
        kind: 'text',
        delta: completionParts.text,
        seq,
        lane: 'main',
      })
    }
    emitStreamStage(input.callbacks, stepMeta, 'completed', 'openai-compat')
    input.callbacks?.onComplete?.(completionParts.text, stepMeta)
    return buildAiProviderLlmResult({
      completion,
      logProvider: input.selection.llmProtocol === 'responses' ? 'openai_compat_responses' : 'openai_compat_chat_completions',
      text: completionParts.text,
      reasoning: completionParts.reasoning,
      successDetails: { llmProtocol: input.selection.llmProtocol },
    })
  }

  return await runOpenAIBaseUrlLlmStream({
    ...input,
    providerName: 'openai_compatible',
    providerKey: 'openai-compatible',
  })
}
