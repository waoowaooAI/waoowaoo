import OpenAI from 'openai'
import { getInternalBaseUrl } from '@/lib/env'
import { buildAiProviderLlmResult } from '@/lib/ai-providers/shared/llm-result'
import {
  buildReasoningAwareContent,
  emitStreamChunk,
  emitStreamStage,
  resolveStreamStepMeta,
  withStreamChunkTimeout,
} from '@/lib/ai-providers/shared/llm-support'
import {
  arkResponsesCompletion,
  arkResponsesStream,
  buildArkThinkingParam,
  convertChatMessagesToArkInput,
} from './responses'
import type {
  AiProviderLlmResult,
  AiProviderLlmStreamContext,
  AiProviderVisionExecutionContext,
} from '@/lib/ai-providers/runtime-types'
import { buildOpenAIChatCompletion } from '@/lib/ai-providers/llm/openai-compat'

export async function runArkLlmCompletion(input: {
  apiKey: string
  modelId: string
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[]
  reasoning: boolean
}): Promise<AiProviderLlmResult> {
  const arkThinkingParams = buildArkThinkingParam(input.modelId, input.reasoning)
  const arkResult = await arkResponsesCompletion({
    apiKey: input.apiKey,
    model: input.modelId,
    input: convertChatMessagesToArkInput(input.messages),
    thinking: arkThinkingParams.thinking,
  })
  const completion = buildOpenAIChatCompletion(
    input.modelId,
    buildReasoningAwareContent(arkResult.text, arkResult.reasoning),
    arkResult.usage,
  )
  return buildAiProviderLlmResult({
    completion,
    logProvider: 'ark',
    text: arkResult.text,
    reasoning: arkResult.reasoning,
    usage: arkResult.usage,
    successDetails: { engine: 'ark_responses' },
  })
}

export async function runArkLlmStream(input: AiProviderLlmStreamContext): Promise<AiProviderLlmResult> {
  const stepMeta = resolveStreamStepMeta(input.options)
  const useReasoning = input.options.reasoning ?? true
  const arkThinkingParams = buildArkThinkingParam(input.selection.modelId, useReasoning)
  const { stream: arkStream, result: getResult } = arkResponsesStream({
    apiKey: input.providerConfig.apiKey,
    model: input.selection.modelId,
    input: convertChatMessagesToArkInput(input.messages),
    temperature: input.options.temperature ?? 0.7,
    thinking: arkThinkingParams.thinking,
  })

  emitStreamStage(input.callbacks, stepMeta, 'streaming', input.selection.provider)
  let seq = 1
  for await (const chunk of withStreamChunkTimeout(arkStream as AsyncIterable<unknown>)) {
    const arkChunk = chunk as { kind: 'reasoning' | 'text'; delta: string }
    if (arkChunk.kind === 'reasoning' && arkChunk.delta) {
      emitStreamChunk(input.callbacks, stepMeta, {
        kind: 'reasoning',
        delta: arkChunk.delta,
        seq,
        lane: 'reasoning',
      })
      seq += 1
    }
    if (arkChunk.kind === 'text' && arkChunk.delta) {
      emitStreamChunk(input.callbacks, stepMeta, {
        kind: 'text',
        delta: arkChunk.delta,
        seq,
        lane: 'main',
      })
      seq += 1
    }
  }

  const arkResult = await getResult()
  const completion = buildOpenAIChatCompletion(
    input.selection.modelId,
    buildReasoningAwareContent(arkResult.text, arkResult.reasoning),
    arkResult.usage,
  )
  emitStreamStage(input.callbacks, stepMeta, 'completed', input.selection.provider)
  input.callbacks?.onComplete?.(arkResult.text, stepMeta)
  return buildAiProviderLlmResult({
    completion,
    logProvider: input.selection.provider,
    text: arkResult.text,
    reasoning: arkResult.reasoning,
    usage: arkResult.usage,
  })
}

type ArkVisionContentItem = { type: 'input_image'; image_url: string } | { type: 'input_text'; text: string }

export async function runArkVisionCompletion(input: AiProviderVisionExecutionContext): Promise<AiProviderLlmResult> {
  const { normalizeToBase64ForGeneration } = await import('@/lib/media/outbound-image')

  const content: ArkVisionContentItem[] = []
  for (const url of input.imageUrls) {
    let finalUrl = url
    try {
      if (!url.startsWith('http') && !url.startsWith('data:')) {
        finalUrl = await normalizeToBase64ForGeneration(url)
      } else if (url.startsWith('/')) {
        finalUrl = await normalizeToBase64ForGeneration(url)
      }
    } catch {
      const baseUrl = getInternalBaseUrl()
      finalUrl = `${baseUrl}${url}`
    }
    content.push({ type: 'input_image', image_url: finalUrl })
  }
  if (input.textPrompt) {
    content.push({ type: 'input_text', text: input.textPrompt })
  }

  const thinkingType = input.reasoning ? 'enabled' : 'disabled'
  const { text, usage } = await arkResponsesCompletion({
    apiKey: input.providerConfig.apiKey,
    model: input.selection.modelId,
    input: [{ role: 'user', content }],
    thinking: { type: thinkingType },
  })

  const completion = buildOpenAIChatCompletion(input.selection.modelId, text, usage)
  return buildAiProviderLlmResult({
    completion,
    logProvider: 'ark',
    text,
    reasoning: '',
    usage,
  })
}
