import { GoogleGenAI } from '@google/genai'
import { buildAiProviderLlmResult } from '@/lib/ai-providers/shared/llm-result'
import {
  buildReasoningAwareContent,
  emitStreamChunk,
  emitStreamStage,
  resolveStreamStepMeta,
  withStreamChunkTimeout,
} from '@/lib/ai-providers/shared/llm-support'
import type {
  AiProviderLlmResult,
  AiProviderLlmStreamContext,
  AiProviderVisionExecutionContext,
} from '@/lib/ai-providers/runtime-types'
import { buildOpenAIChatCompletion } from '@/lib/ai-providers/llm/openai-compat'
import { extractGoogleParts, extractGoogleText, extractGoogleUsage, GoogleEmptyResponseError } from '@/lib/ai-providers/llm/google'

type GoogleVisionPart = { inlineData: { mimeType: string; data: string } } | { text: string }
type GoogleModelClient = { generateContentStream?: (params: unknown) => Promise<unknown> }
type GoogleChunk = { stream?: AsyncIterable<unknown> }

export async function runGoogleLlmCompletion(input: {
  apiKey: string
  baseUrl?: string
  modelId: string
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[]
  temperature: number
  reasoning: boolean
  reasoningEffort: 'minimal' | 'low' | 'medium' | 'high'
  logProvider: string
}): Promise<AiProviderLlmResult> {
  const googleAiOptions = input.baseUrl
    ? { apiKey: input.apiKey, httpOptions: { baseUrl: input.baseUrl } }
    : { apiKey: input.apiKey }
  const ai = new GoogleGenAI(googleAiOptions)

  const systemParts = input.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .filter(Boolean)
  const contents = input.messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }))

  const systemInstruction = systemParts.length > 0
    ? { parts: [{ text: systemParts.join('\n') }] }
    : undefined
  const supportsThinkingLevel = input.modelId.startsWith('gemini-3')
  const thinkingConfig = input.reasoning && supportsThinkingLevel
    ? { thinkingLevel: input.reasoningEffort, includeThoughts: true }
    : undefined

  const response = await ai.models.generateContent({
    model: input.modelId,
    contents,
    config: {
      temperature: input.temperature,
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(thinkingConfig ? { thinkingConfig } : {}),
    },
  } as never)

  const googleParts = extractGoogleParts(response, true)
  const usage = extractGoogleUsage(response)
  const completion = buildOpenAIChatCompletion(
    input.modelId,
    buildReasoningAwareContent(googleParts.text, googleParts.reasoning),
    usage,
  )
  return buildAiProviderLlmResult({
    completion,
    logProvider: input.logProvider,
    text: googleParts.text,
    reasoning: googleParts.reasoning,
    usage,
  })
}

export async function runGoogleLlmStream(input: AiProviderLlmStreamContext): Promise<AiProviderLlmResult> {
  const googleAiOptions = input.providerConfig.baseUrl
    ? { apiKey: input.providerConfig.apiKey, httpOptions: { baseUrl: input.providerConfig.baseUrl } }
    : { apiKey: input.providerConfig.apiKey }
  const ai = new GoogleGenAI(googleAiOptions)
  const modelClient = (ai as unknown as { models?: GoogleModelClient }).models
  if (!modelClient || typeof modelClient.generateContentStream !== 'function') {
    throw new Error('GOOGLE_STREAM_UNAVAILABLE: google provider does not expose generateContentStream')
  }

  const systemParts = input.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .filter(Boolean)
  const contents = input.messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }))
  const systemInstruction = systemParts.length > 0
    ? { parts: [{ text: systemParts.join('\n') }] }
    : undefined
  const supportsThinkingLevel = input.selection.modelId.startsWith('gemini-3')
  const thinkingConfig = (input.options.reasoning ?? true) && supportsThinkingLevel
    ? { thinkingLevel: input.options.reasoningEffort || 'high', includeThoughts: true }
    : undefined

  const stepMeta = resolveStreamStepMeta(input.options)
  emitStreamStage(input.callbacks, stepMeta, 'streaming', input.selection.provider)
  const stream = await modelClient.generateContentStream({
    model: input.selection.modelId,
    contents,
    config: {
      temperature: input.options.temperature ?? 0.7,
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(thinkingConfig ? { thinkingConfig } : {}),
    },
  })
  const streamChunk = stream as GoogleChunk
  const streamIterable = streamChunk?.stream || (stream as AsyncIterable<unknown>)

  let seq = 1
  let text = ''
  let reasoning = ''
  let lastChunk: unknown = null
  for await (const chunk of withStreamChunkTimeout(streamIterable)) {
    lastChunk = chunk
    const chunkParts = extractGoogleParts(chunk)

    let reasoningDelta = chunkParts.reasoning
    if (reasoningDelta && reasoning && reasoningDelta.startsWith(reasoning)) {
      reasoningDelta = reasoningDelta.slice(reasoning.length)
    }
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

    let textDelta = chunkParts.text
    if (textDelta && text && textDelta.startsWith(text)) {
      textDelta = textDelta.slice(text.length)
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

  const usage = extractGoogleUsage(lastChunk)
  if (!text) {
    throw new GoogleEmptyResponseError('stream_empty')
  }
  const completion = buildOpenAIChatCompletion(
    input.selection.modelId,
    buildReasoningAwareContent(text, reasoning),
    usage,
  )
  emitStreamStage(input.callbacks, stepMeta, 'completed', input.selection.provider)
  input.callbacks?.onComplete?.(text, stepMeta)
  return buildAiProviderLlmResult({
    completion,
    logProvider: input.selection.provider,
    text,
    reasoning,
    usage,
  })
}

export async function runGoogleVisionCompletion(input: AiProviderVisionExecutionContext): Promise<AiProviderLlmResult> {
  const ai = new GoogleGenAI(
    input.providerConfig.baseUrl
      ? { apiKey: input.providerConfig.apiKey, httpOptions: { baseUrl: input.providerConfig.baseUrl } }
      : { apiKey: input.providerConfig.apiKey },
  )
  const { normalizeToBase64ForGeneration } = await import('@/lib/media/outbound-image')

  const parts: GoogleVisionPart[] = []
  for (const url of input.imageUrls) {
    try {
      const dataUrl = url.startsWith('data:') ? url : await normalizeToBase64ForGeneration(url)
      const base64Start = dataUrl.indexOf(';base64,')
      if (base64Start !== -1) {
        const mimeType = dataUrl.substring(5, base64Start)
        const data = dataUrl.substring(base64Start + 8)
        parts.push({ inlineData: { mimeType, data } })
      }
    } catch {
      continue
    }
  }
  if (input.textPrompt) parts.push({ text: input.textPrompt })

  const response = await ai.models.generateContent({
    model: input.selection.modelId,
    contents: [{ role: 'user', parts }],
    config: { temperature: input.temperature },
  })

  const text = extractGoogleText(response)
  const usage = extractGoogleUsage(response)
  const completion = buildOpenAIChatCompletion(input.selection.modelId, text, usage)
  return buildAiProviderLlmResult({
    completion,
    logProvider: input.providerKey,
    text,
    reasoning: '',
    usage,
  })
}
