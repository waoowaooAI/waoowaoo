import { GoogleGenAI } from '@google/genai'
import { getInternalBaseUrl } from '@/lib/env'
import { normalizeGeminiImageSize } from '@/lib/ai-providers/shared/google-image-helpers'
import { buildAiProviderLlmResult } from '@/lib/ai-providers/shared/llm-result'
import {
  buildReasoningAwareContent,
  emitStreamChunk,
  emitStreamStage,
  resolveStreamStepMeta,
  withStreamChunkTimeout,
} from '@/lib/ai-providers/shared/llm-support'
import { asUnknownObject, getErrorMessage, type UnknownObject } from '@/lib/ai-providers/shared/helpers'
import type {
  AiProviderLlmResult,
  AiProviderLlmStreamContext,
  AiProviderVisionExecutionContext,
} from '@/lib/ai-providers/runtime-types'
import { buildOpenAIChatCompletion } from '@/lib/ai-providers/shared/openai-chat-completion'
import { getImageBase64Cached } from '@/lib/image-cache'
import { logInternal } from '@/lib/logging/semantic'

type GoogleVisionPart = { inlineData: { mimeType: string; data: string } } | { text: string }
type GoogleModelClient = { generateContentStream?: (params: unknown) => Promise<unknown> }
type GoogleChunk = { stream?: AsyncIterable<unknown> }

interface GoogleTextPart {
  text?: unknown
  thought?: unknown
  type?: unknown
}

interface GoogleUsageLike {
  promptTokenCount?: unknown
  prompt_tokens?: unknown
  input_tokens?: unknown
  totalTokenCount?: unknown
  total_tokens?: unknown
  candidatesTokenCount?: unknown
  completion_tokens?: unknown
  output_tokens?: unknown
}

interface GoogleResponseLike {
  candidates?: Array<{ content?: { parts?: GoogleTextPart[] }; finishReason?: unknown }>
  response?: { candidates?: Array<{ content?: { parts?: GoogleTextPart[] }; finishReason?: unknown }> }
  usageMetadata?: GoogleUsageLike
  usage?: GoogleUsageLike
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isThoughtPart(part: GoogleTextPart): boolean {
  if (part.thought === true) return true
  if (typeof part.type === 'string') {
    const normalized = part.type.toLowerCase()
    if (normalized.includes('thought') || normalized.includes('reason')) return true
  }
  return false
}

export class GoogleEmptyResponseError extends Error {
  public constructor(finishReason?: unknown) {
    const reason = finishReason ? ` (finishReason: ${String(finishReason)})` : ''
    super(`Google Gemini returned an empty text response${reason}, please retry`)
    this.name = 'GoogleEmptyResponseError'
  }
}

export function extractGoogleParts(response: unknown, throwOnEmpty = false): { text: string; reasoning: string } {
  if (!response || typeof response !== 'object') {
    return { text: '', reasoning: '' }
  }
  const safe = response as GoogleResponseLike
  const candidates = safe.candidates || safe.response?.candidates || []
  const firstCandidate = candidates[0]
  const parts = firstCandidate?.content?.parts || []
  let text = ''
  let reasoning = ''
  for (const part of parts) {
    const value = typeof part.text === 'string' ? part.text : ''
    if (!value) continue
    if (isThoughtPart(part)) {
      reasoning += value
    } else {
      text += value
    }
  }

  if (throwOnEmpty && candidates.length > 0 && !text) {
    const finishReason = firstCandidate?.finishReason
    if (finishReason !== 'SAFETY' && finishReason !== 'PROHIBITED_CONTENT') {
      throw new GoogleEmptyResponseError(finishReason)
    }
  }

  return { text, reasoning }
}

export function extractGoogleText(response: unknown): string {
  return extractGoogleParts(response).text
}

export function extractGoogleUsage(response: unknown): { promptTokens: number; completionTokens: number } {
  const safe = response && typeof response === 'object' ? (response as GoogleResponseLike) : null
  const usage = safe?.usageMetadata || safe?.usage
  const promptTokens =
    toNumber(usage?.promptTokenCount)
    ?? toNumber(usage?.prompt_tokens)
    ?? toNumber(usage?.input_tokens)
    ?? 0
  const totalTokens = toNumber(usage?.totalTokenCount) ?? toNumber(usage?.total_tokens)
  const completionTokens =
    toNumber(usage?.candidatesTokenCount)
    ?? toNumber(usage?.completion_tokens)
    ?? toNumber(usage?.output_tokens)
    ?? (typeof totalTokens === 'number' ? Math.max(totalTokens - promptTokens, 0) : 0)
  return { promptTokens, completionTokens }
}

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

type GeminiBatchClient = {
  batches: {
    create(args: { model: string; src: unknown[]; config: { displayName: string } }): Promise<unknown>
    get(args: { name: string }): Promise<unknown>
  }
}

type GeminiBatchContentPart = { inlineData: { mimeType: string; data: string } } | { text: string }

export async function submitGeminiBatch(
  apiKey: string,
  prompt: string,
  options?: { referenceImages?: string[]; aspectRatio?: string; resolution?: string },
): Promise<{ success: boolean; batchName?: string; error?: string }> {
  if (!apiKey) return { success: false, error: '请配置 Google AI API Key' }

  try {
    const ai = new GoogleGenAI({ apiKey })

    const contentParts: GeminiBatchContentPart[] = []

    const referenceImages = options?.referenceImages || []
    for (let i = 0; i < Math.min(referenceImages.length, 14); i += 1) {
      const imageData = referenceImages[i]

      if (imageData.startsWith('data:')) {
        const base64Start = imageData.indexOf(';base64,')
        if (base64Start !== -1) {
          const mimeType = imageData.substring(5, base64Start)
          const data = imageData.substring(base64Start + 8)
          contentParts.push({ inlineData: { mimeType, data } })
        }
        continue
      }

      if (imageData.startsWith('http') || imageData.startsWith('/')) {
        try {
          const fullUrl = imageData.startsWith('/') ? `${getInternalBaseUrl()}${imageData}` : imageData
          const base64DataUrl = await getImageBase64Cached(fullUrl)
          const base64Start = base64DataUrl.indexOf(';base64,')
          if (base64Start !== -1) {
            const mimeType = base64DataUrl.substring(5, base64Start)
            const data = base64DataUrl.substring(base64Start + 8)
            contentParts.push({ inlineData: { mimeType, data } })
          }
        } catch (e: unknown) {
          logInternal('GeminiBatch', 'WARN', `下载参考图片 ${i + 1} 失败`, { error: getErrorMessage(e) })
        }
        continue
      }

      contentParts.push({ inlineData: { mimeType: 'image/png', data: imageData } })
    }

    contentParts.push({ text: prompt })

    const imageConfig: UnknownObject = {}
    if (options?.aspectRatio) imageConfig.aspectRatio = options.aspectRatio
    const imageSize = normalizeGeminiImageSize(options?.resolution)
    if (imageSize) imageConfig.imageSize = imageSize

    const inlinedRequests = [
      {
        contents: [{ parts: contentParts }],
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
          ...(Object.keys(imageConfig).length > 0 ? { imageConfig } : {}),
        },
      },
    ]

    const batchClient = ai as unknown as GeminiBatchClient
    const batchJob = await batchClient.batches.create({
      model: 'gemini-3-pro-image-preview',
      src: inlinedRequests,
      config: { displayName: `image-gen-${Date.now()}` },
    })

    const batchRecord = asUnknownObject(batchJob)
    const batchName = batchRecord && typeof batchRecord.name === 'string' ? batchRecord.name : ''
    if (!batchName) return { success: false, error: '未返回 batch name' }

    logInternal('GeminiBatch', 'INFO', `✅ 任务已提交: ${batchName}`)
    return { success: true, batchName }
  } catch (error: unknown) {
    const message = getErrorMessage(error)
    logInternal('GeminiBatch', 'ERROR', '提交异常', { error: message })
    return { success: false, error: `提交异常: ${message}` }
  }
}

export async function queryGeminiBatchStatus(
  batchName: string,
  apiKey: string,
): Promise<{ status: string; completed: boolean; failed: boolean; imageBase64?: string; imageUrl?: string; error?: string }> {
  if (!apiKey) return { status: 'error', completed: false, failed: true, error: '请配置 Google AI API Key' }

  try {
    const ai = new GoogleGenAI({ apiKey })
    const batchClient = ai as unknown as GeminiBatchClient
    const batchJob = await batchClient.batches.get({ name: batchName })
    const batchRecord = asUnknownObject(batchJob) || {}

    const state = typeof batchRecord.state === 'string' ? batchRecord.state : 'UNKNOWN'
    logInternal('GeminiBatch', 'INFO', `查询状态: ${batchName} -> ${state}`)

    const completedStates = new Set(['JOB_STATE_SUCCEEDED'])
    const failedStates = new Set(['JOB_STATE_FAILED', 'JOB_STATE_CANCELLED', 'JOB_STATE_EXPIRED'])

    if (completedStates.has(state)) {
      const dest = asUnknownObject(batchRecord.dest)
      const responses = Array.isArray(dest?.inlinedResponses) ? dest.inlinedResponses : []
      if (responses.length > 0) {
        const firstResponse = asUnknownObject(responses[0])
        const response = asUnknownObject(firstResponse?.response)
        const candidates = Array.isArray(response?.candidates) ? response.candidates : []
        const firstCandidate = asUnknownObject(candidates[0])
        const content = asUnknownObject(firstCandidate?.content)
        const parts = Array.isArray(content?.parts) ? content.parts : []

        for (const part of parts) {
          const partRecord = asUnknownObject(part)
          const inlineData = asUnknownObject(partRecord?.inlineData)
          if (inlineData && typeof inlineData.data === 'string') {
            const imageBase64 = inlineData.data
            const mimeType = typeof inlineData.mimeType === 'string' ? inlineData.mimeType : 'image/png'
            const imageUrl = `data:${mimeType};base64,${imageBase64}`
            logInternal('GeminiBatch', 'INFO', `✅ 获取到图片，MIME 类型: ${mimeType}`, { batchName })
            return { status: state, completed: true, failed: false, imageBase64, imageUrl }
          }
        }
      }
      return { status: state, completed: true, failed: false, error: 'No image data in batch result' }
    }

    if (failedStates.has(state)) {
      return { status: state, completed: false, failed: true, error: `Gemini Batch failed: ${state}` }
    }

    return { status: state, completed: false, failed: false }
  } catch (error: unknown) {
    const message = getErrorMessage(error)
    logInternal('GeminiBatch', 'ERROR', 'Query error', { batchName, error: message })
    return { status: 'error', completed: false, failed: true, error: message }
  }
}
