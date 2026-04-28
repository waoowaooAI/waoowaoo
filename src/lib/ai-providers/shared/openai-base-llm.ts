import OpenAI from 'openai'
import { generateText, streamText, type ModelMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { getCompletionParts } from '@/lib/ai-providers/shared/completion-parts'
import { buildOpenAIChatCompletion } from '@/lib/ai-providers/shared/openai-chat-completion'
import { buildAiProviderLlmResult } from '@/lib/ai-providers/shared/llm-result'
import {
  buildReasoningAwareContent,
  extractStreamDeltaParts,
  getConversationMessages,
  getSystemPrompt,
  mapReasoningEffort,
  emitStreamChunk,
  emitStreamStage,
  resolveStreamStepMeta,
  withStreamChunkTimeout,
  shouldUseOpenAIReasoningProviderOptions,
} from '@/lib/ai-providers/shared/llm-support'
import type {
  AiProviderLlmResult,
  AiProviderLlmStreamContext,
} from '@/lib/ai-providers/runtime-types'

type AISdkStreamChunk = {
  type?: string
  text?: string
}

type OpenAIStreamWithFinal = AsyncIterable<unknown> & {
  finalChatCompletion?: () => Promise<OpenAI.Chat.Completions.ChatCompletion>
}

export async function runOpenAIBaseUrlLlmCompletion(input: {
  providerName: string
  providerKey: string
  modelId: string
  baseUrl: string
  apiKey: string
  apiMode?: 'gemini-sdk' | 'openai-official'
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[]
  temperature: number
  reasoning: boolean
  reasoningEffort: 'minimal' | 'low' | 'medium' | 'high'
  maxRetries: number
  isOpenRouter?: boolean
}): Promise<AiProviderLlmResult> {
  if (!input.isOpenRouter) {
    const aiOpenAI = createOpenAI({
      baseURL: input.baseUrl,
      apiKey: input.apiKey,
      name: input.providerName,
    })
    const isNativeOpenAIReasoning = shouldUseOpenAIReasoningProviderOptions({
      providerKey: input.providerKey,
      providerApiMode: input.apiMode,
      modelId: input.modelId,
    })
    const aiSdkProviderOptions = input.reasoning && isNativeOpenAIReasoning
      ? {
        openai: {
          reasoningEffort: mapReasoningEffort(input.reasoningEffort),
          forceReasoning: true,
        },
      }
      : undefined
    const aiSdkResult = await generateText({
      model: aiOpenAI.chat(input.modelId),
      system: getSystemPrompt(input.messages),
      messages: getConversationMessages(input.messages) as ModelMessage[],
      ...(input.reasoning ? {} : { temperature: input.temperature }),
      maxRetries: input.maxRetries,
      ...(aiSdkProviderOptions ? { providerOptions: aiSdkProviderOptions } : {}),
    })
    const usage = aiSdkResult.usage || aiSdkResult.totalUsage
    const normalizedUsage = {
      promptTokens: usage?.inputTokens ?? 0,
      completionTokens: usage?.outputTokens ?? 0,
    }
    return buildAiProviderLlmResult({
      completion: buildOpenAIChatCompletion(
        input.modelId,
        buildReasoningAwareContent(aiSdkResult.text || '', aiSdkResult.reasoningText || ''),
        normalizedUsage,
      ),
      logProvider: input.providerName,
      text: aiSdkResult.text || '',
      reasoning: aiSdkResult.reasoningText || '',
      usage: normalizedUsage,
      successDetails: { engine: 'ai_sdk' },
    })
  }

  const client = new OpenAI({
    baseURL: input.baseUrl,
    apiKey: input.apiKey,
  })
  const extraParams: { [key: string]: unknown } = {}
  if (input.reasoning) {
    extraParams.reasoning = { effort: input.reasoningEffort }
  }
  const completion = await client.chat.completions.create({
    model: input.modelId,
    messages: input.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    temperature: input.temperature,
    ...extraParams,
  })
  const normalizedCompletion = completion as OpenAI.Chat.Completions.ChatCompletion
  const completionParts = getCompletionParts(normalizedCompletion)
  return buildAiProviderLlmResult({
    completion: normalizedCompletion,
    logProvider: input.providerName,
    text: completionParts.text,
    reasoning: completionParts.reasoning,
    successDetails: { engine: 'openai_sdk' },
  })
}

export async function runOpenAIBaseUrlLlmStream(input: AiProviderLlmStreamContext & {
  providerName: string
  providerKey: string
  isOpenRouter?: boolean
}): Promise<AiProviderLlmResult> {
  const stepMeta = resolveStreamStepMeta(input.options)
  if (!input.providerConfig.baseUrl) {
    throw new Error(`PROVIDER_BASE_URL_MISSING: ${input.selection.provider} (llm)`)
  }

  if (!input.isOpenRouter) {
    const aiOpenAI = createOpenAI({
      baseURL: input.providerConfig.baseUrl,
      apiKey: input.providerConfig.apiKey,
      name: input.providerName,
    })
    const isNativeOpenAIReasoning = shouldUseOpenAIReasoningProviderOptions({
      providerKey: input.providerKey,
      providerApiMode: input.providerConfig.apiMode,
      modelId: input.selection.modelId,
    })
    const aiSdkProviderOptions = (input.options.reasoning ?? true) && isNativeOpenAIReasoning
      ? {
        openai: {
          reasoningEffort: mapReasoningEffort(input.options.reasoningEffort || 'high'),
          forceReasoning: true,
        },
      }
      : undefined
    const useReasoning = input.options.reasoning ?? true
    const aiStreamResult = streamText({
      model: aiOpenAI.chat(input.selection.modelId),
      system: getSystemPrompt(input.messages),
      messages: getConversationMessages(input.messages),
      ...(useReasoning ? {} : { temperature: input.options.temperature ?? 0.7 }),
      maxRetries: input.options.maxRetries ?? 2,
      ...(aiSdkProviderOptions ? { providerOptions: aiSdkProviderOptions } : {}),
    })

    emitStreamStage(input.callbacks, stepMeta, 'streaming', input.providerName)
    let text = ''
    let reasoning = ''
    let seq = 1
    for await (const chunk of withStreamChunkTimeout(aiStreamResult.fullStream as AsyncIterable<AISdkStreamChunk>)) {
      if (chunk?.type === 'reasoning-delta' && typeof chunk.text === 'string' && chunk.text) {
        reasoning += chunk.text
        emitStreamChunk(input.callbacks, stepMeta, {
          kind: 'reasoning',
          delta: chunk.text,
          seq,
          lane: 'reasoning',
        })
        seq += 1
      }
      if (chunk?.type === 'text-delta' && typeof chunk.text === 'string' && chunk.text) {
        text += chunk.text
        emitStreamChunk(input.callbacks, stepMeta, {
          kind: 'text',
          delta: chunk.text,
          seq,
          lane: 'main',
        })
        seq += 1
      }
    }

    const resolvedReasoning = await Promise.resolve(aiStreamResult.reasoningText).catch(() => reasoning)
    const resolvedText = await Promise.resolve(aiStreamResult.text).catch(() => text)
    const usage = await Promise.resolve(aiStreamResult.usage).catch(() => null)
    const completion = buildOpenAIChatCompletion(
      input.selection.modelId,
      buildReasoningAwareContent(resolvedText || text, resolvedReasoning || reasoning),
      {
        promptTokens: usage?.inputTokens ?? 0,
        completionTokens: usage?.outputTokens ?? 0,
      },
    )
    emitStreamStage(input.callbacks, stepMeta, 'completed', input.providerName)
    input.callbacks?.onComplete?.(resolvedText || text, stepMeta)
    return buildAiProviderLlmResult({
      completion,
      logProvider: input.providerName,
      text: resolvedText || text,
      reasoning: resolvedReasoning || reasoning,
      usage: {
        promptTokens: usage?.inputTokens ?? 0,
        completionTokens: usage?.outputTokens ?? 0,
      },
    })
  }

  const client = new OpenAI({
    baseURL: input.providerConfig.baseUrl,
    apiKey: input.providerConfig.apiKey,
  })
  const extraParams: { [key: string]: unknown } = {}
  if (input.options.reasoning ?? true) {
    extraParams.reasoning = { effort: input.options.reasoningEffort || 'high' }
  }
  emitStreamStage(input.callbacks, stepMeta, 'streaming', input.providerName)
  const stream = await client.chat.completions.create({
    model: input.selection.modelId,
    messages: input.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    ...((input.options.reasoning ?? true) ? {} : { temperature: input.options.temperature ?? 0.7 }),
    stream: true,
    ...extraParams,
  } as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming)
  let text = ''
  let reasoning = ''
  let seq = 1
  let finalCompletion: OpenAI.Chat.Completions.ChatCompletion | null = null
  for await (const part of withStreamChunkTimeout(stream as AsyncIterable<unknown>)) {
    const { textDelta, reasoningDelta } = extractStreamDeltaParts(part)
    if (reasoningDelta) {
      reasoning += reasoningDelta
      emitStreamChunk(input.callbacks, stepMeta, {
        kind: 'reasoning',
        delta: reasoningDelta,
        seq,
        lane: 'reasoning',
      })
      seq += 1
    }
    if (textDelta) {
      text += textDelta
      emitStreamChunk(input.callbacks, stepMeta, {
        kind: 'text',
        delta: textDelta,
        seq,
        lane: 'main',
      })
      seq += 1
    }
  }
  const finalChatCompletionFn = (stream as OpenAIStreamWithFinal)?.finalChatCompletion
  if (typeof finalChatCompletionFn === 'function') {
    try {
      finalCompletion = await finalChatCompletionFn.call(stream)
      const finalParts = getCompletionParts(finalCompletion)
      reasoning = finalParts.reasoning || reasoning
      text = finalParts.text || text
    } catch {
      finalCompletion = null
    }
  }
  const completion = buildOpenAIChatCompletion(
    input.selection.modelId,
    buildReasoningAwareContent(text, reasoning),
    finalCompletion
      ? {
        promptTokens: Number(finalCompletion.usage?.prompt_tokens ?? 0),
        completionTokens: Number(finalCompletion.usage?.completion_tokens ?? 0),
      }
      : undefined,
  )
  emitStreamStage(input.callbacks, stepMeta, 'completed', input.providerName)
  input.callbacks?.onComplete?.(text, stepMeta)
  return buildAiProviderLlmResult({
    completion,
    logProvider: input.providerName,
    text,
    reasoning,
  })
}
