import OpenAI from 'openai'
import type { ChatCompletionStreamCallbacks } from '@/lib/llm/types'
import { buildOpenAIChatCompletion } from '@/lib/llm/providers/openai-compat'
import { extractStreamDeltaParts } from '@/lib/llm/utils'
import { withStreamChunkTimeout } from '@/lib/llm/stream-timeout'
import { emitStreamChunk, emitStreamStage, resolveStreamStepMeta } from '@/lib/llm/stream-helpers'
import type { OpenAICompatChatRequest } from '../types'
import { createOpenAICompatClient, resolveOpenAICompatClientConfig } from './common'

export async function runOpenAICompatChatCompletion(input: OpenAICompatChatRequest): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const config = await resolveOpenAICompatClientConfig(input.userId, input.providerId)
  const client = createOpenAICompatClient(config)
  return await client.chat.completions.create({
    model: input.modelId,
    messages: input.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    temperature: input.temperature,
  })
}

type OpenAIStreamWithFinal = AsyncIterable<unknown> & {
  finalChatCompletion?: () => Promise<OpenAI.Chat.Completions.ChatCompletion>
}

export async function runOpenAICompatChatCompletionStream(
  input: OpenAICompatChatRequest,
  callbacks?: ChatCompletionStreamCallbacks,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const config = await resolveOpenAICompatClientConfig(input.userId, input.providerId)
  const client = createOpenAICompatClient(config)
  const stepMeta = resolveStreamStepMeta({})

  emitStreamStage(callbacks, stepMeta, 'streaming', 'openai-compat')
  const stream = await client.chat.completions.create({
    model: input.modelId,
    messages: input.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    temperature: input.temperature,
    stream: true,
  } as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming)

  let text = ''
  let reasoning = ''
  let seq = 1
  let finalCompletion: OpenAI.Chat.Completions.ChatCompletion | null = null

  for await (const part of withStreamChunkTimeout(stream as AsyncIterable<unknown>)) {
    const { textDelta, reasoningDelta } = extractStreamDeltaParts(part)
    if (reasoningDelta) {
      reasoning += reasoningDelta
      emitStreamChunk(callbacks, stepMeta, {
        kind: 'reasoning',
        delta: reasoningDelta,
        seq,
        lane: 'reasoning',
      })
      seq += 1
    }
    if (textDelta) {
      text += textDelta
      emitStreamChunk(callbacks, stepMeta, {
        kind: 'text',
        delta: textDelta,
        seq,
        lane: 'main',
      })
      seq += 1
    }
  }

  const finalChatCompletionFn = (stream as OpenAIStreamWithFinal).finalChatCompletion
  if (typeof finalChatCompletionFn === 'function') {
    try {
      finalCompletion = await finalChatCompletionFn.call(stream)
    } catch {
      finalCompletion = null
    }
  }

  const completion = finalCompletion || buildOpenAIChatCompletion(
    input.modelId,
    text || reasoning,
    undefined,
  )

  emitStreamStage(callbacks, stepMeta, 'completed', 'openai-compat')
  callbacks?.onComplete?.(text, stepMeta)
  return completion
}
