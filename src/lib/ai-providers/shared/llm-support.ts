import type { LLMStreamKind } from '@/lib/llm-observe/types'
import type { InternalLLMStreamStepMeta } from '@/lib/llm-observe/internal-stream-context'

export interface ProviderChatCompletionOptions {
  temperature?: number
  reasoning?: boolean
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'
  maxRetries?: number
  projectId?: string
  action?: string
  streamStepId?: string
  streamStepAttempt?: number
  streamStepTitle?: string
  streamStepIndex?: number
  streamStepTotal?: number
  __skipAutoStream?: boolean
}

export interface ProviderChatCompletionStreamCallbacks {
  onStage?: (stage: {
    stage: 'submit' | 'streaming' | 'fallback' | 'completed'
    provider?: string | null
    step?: InternalLLMStreamStepMeta
  }) => void
  onChunk?: (chunk: {
    kind: LLMStreamKind
    delta: string
    seq: number
    lane?: string | null
    step?: InternalLLMStreamStepMeta
  }) => void
  onComplete?: (text: string, step?: InternalLLMStreamStepMeta) => void
  onError?: (error: unknown, step?: InternalLLMStreamStepMeta) => void
}

export type ProviderChatMessage = { role: 'user' | 'assistant' | 'system'; content: string }

export function completionUsageSummary(
  completion: {
    usage?: {
      prompt_tokens?: number
      completion_tokens?: number
      promptTokens?: number
      completionTokens?: number
    } | null
  },
) {
  const usage = completion.usage
  if (!usage) return null
  const promptTokens = Number(usage.prompt_tokens ?? usage.promptTokens ?? 0)
  const completionTokens = Number(usage.completion_tokens ?? usage.completionTokens ?? 0)
  return { promptTokens, completionTokens }
}

function splitThinkTaggedContent(input: string): { text: string; reasoning: string } {
  const thinkTagPattern = /<(think|thinking)\b[^>]*>([\s\S]*?)<\/\1>/gi
  const reasoningParts: string[] = []
  let matched = false
  const stripped = input.replace(thinkTagPattern, (_fullMatch, _tagName: string, inner: string) => {
    matched = true
    const trimmed = inner.trim()
    if (trimmed) reasoningParts.push(trimmed)
    return ''
  })
  if (!matched) return { text: input, reasoning: '' }
  return {
    text: stripped.trim(),
    reasoning: reasoningParts.join('\n\n').trim(),
  }
}

function collectTextValue(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map((item) => collectTextValue(item)).join('')
  if (typeof value === 'object') {
    const obj = value as { [key: string]: unknown }
    if (typeof obj.text === 'string') return obj.text
    if (typeof obj.content === 'string') return obj.content
    if (typeof obj.delta === 'string') return obj.delta
    if (Array.isArray(obj.parts)) return obj.parts.map((part) => collectTextValue(part)).join('')
  }
  return ''
}

export function extractStreamDeltaParts(part: unknown): { textDelta: string; reasoningDelta: string } {
  const partObject =
    typeof part === 'object' && part !== null
      ? (part as {
        choices?: Array<{ delta?: { [key: string]: unknown } }>
        response?: {
          output_text?: { delta?: unknown }
          reasoning?: { delta?: unknown }
        }
      })
      : {}
  const delta = partObject.choices?.[0]?.delta || {}
  const contentParts = extractCompletionPartsFromContent(delta.content)
  const responseDelta = partObject.response?.output_text?.delta || ''
  const responseReasoning = partObject.response?.reasoning?.delta || ''
  const explicitReasoning =
    collectTextValue(delta.reasoning) ||
    collectTextValue(delta.reasoning_content) ||
    collectTextValue(delta.reasoningContent) ||
    collectTextValue(delta.thinking) ||
    collectTextValue(delta.reasoning_details) ||
    collectTextValue(responseReasoning)
  const textDelta =
    contentParts.text ||
    collectTextValue(delta.output_text) ||
    collectTextValue(delta.text) ||
    collectTextValue(responseDelta) ||
    ''
  const reasoningDelta = contentParts.reasoning || explicitReasoning || ''
  return { textDelta, reasoningDelta }
}

function extractCompletionPartsFromContent(content: unknown): { text: string; reasoning: string } {
  if (typeof content === 'string') return splitThinkTaggedContent(content)
  if (!Array.isArray(content)) return splitThinkTaggedContent(collectTextValue(content))

  let text = ''
  let reasoning = ''
  for (const part of content) {
    if (typeof part === 'string') {
      text += part
      continue
    }
    if (!part || typeof part !== 'object') continue
    const obj = part as { [key: string]: unknown }
    const kind = typeof obj.type === 'string' ? obj.type.toLowerCase() : ''
    const value =
      (typeof obj.text === 'string' && obj.text) ||
      (typeof obj.content === 'string' && obj.content) ||
      collectTextValue(obj.delta) ||
      collectTextValue(obj.output_text) ||
      ''
    if (!value) continue
    if (kind.includes('reason') || kind.includes('think')) {
      reasoning += value
    } else {
      const parsed = splitThinkTaggedContent(value)
      text += parsed.text
      if (parsed.reasoning) reasoning += parsed.reasoning
    }
  }
  return { text, reasoning }
}

export function getSystemPrompt(messages: ProviderChatMessage[]) {
  const systemParts = messages.filter((message) => message.role === 'system').map((message) => message.content).filter(Boolean)
  return systemParts.length === 0 ? undefined : systemParts.join('\n')
}

export function getConversationMessages(messages: ProviderChatMessage[]) {
  return messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({ role: message.role, content: message.content }))
}

export function mapReasoningEffort(effort: 'minimal' | 'low' | 'medium' | 'high' | undefined) {
  if (effort === 'low' || effort === 'medium' || effort === 'high') return effort
  if (effort === 'minimal') return 'low'
  return 'high'
}

export function buildReasoningAwareContent(text: string, reasoning: string) {
  if (!reasoning) return text
  return [
    { type: 'reasoning', text: reasoning },
    { type: 'text', text },
  ]
}

export function resolveStreamStepMeta(options: ProviderChatCompletionOptions): InternalLLMStreamStepMeta | undefined {
  const id = typeof options.streamStepId === 'string' ? options.streamStepId.trim() : ''
  const attempt = typeof options.streamStepAttempt === 'number' && Number.isFinite(options.streamStepAttempt)
    ? Math.max(1, Math.floor(options.streamStepAttempt))
    : null
  const title = typeof options.streamStepTitle === 'string' ? options.streamStepTitle.trim() : ''
  const index = typeof options.streamStepIndex === 'number' && Number.isFinite(options.streamStepIndex)
    ? Math.max(1, Math.floor(options.streamStepIndex))
    : null
  const total = typeof options.streamStepTotal === 'number' && Number.isFinite(options.streamStepTotal)
    ? Math.max(1, Math.floor(options.streamStepTotal))
    : null
  if (!id && !attempt && !title && !index && !total) return undefined
  return {
    ...(id ? { id } : {}),
    ...(attempt ? { attempt } : {}),
    ...(title ? { title } : {}),
    ...(index ? { index } : {}),
    ...(total ? { total: Math.max(index || 1, total) } : {}),
  }
}

export function emitStreamStage(
  callbacks: ProviderChatCompletionStreamCallbacks | undefined,
  step: InternalLLMStreamStepMeta | undefined,
  stage: 'submit' | 'streaming' | 'fallback' | 'completed',
  provider?: string | null,
) {
  callbacks?.onStage?.({ stage, provider, ...(step ? { step } : {}) })
}

export function emitStreamChunk(
  callbacks: ProviderChatCompletionStreamCallbacks | undefined,
  step: InternalLLMStreamStepMeta | undefined,
  chunk: {
    kind: LLMStreamKind
    delta: string
    seq: number
    lane?: string | null
  },
) {
  callbacks?.onChunk?.({ ...chunk, ...(step ? { step } : {}) })
}

export function emitChunkedText(
  text: string,
  callbacks?: ProviderChatCompletionStreamCallbacks,
  kind: LLMStreamKind = 'text',
  seqStart = 1,
  step?: InternalLLMStreamStepMeta,
) {
  if (!text) return seqStart
  let seq = seqStart
  const chunkSize = 320
  for (let i = 0; i < text.length; i += chunkSize) {
    emitStreamChunk(callbacks, step, {
      kind,
      delta: text.slice(i, i + chunkSize),
      seq,
      lane: 'main',
    })
    seq += 1
  }
  return seq
}

export class StreamChunkTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`LLM_STREAM_TIMEOUT: No stream chunk received within ${Math.round(timeoutMs / 1000)}s`)
    this.name = 'StreamChunkTimeoutError'
  }
}

export async function* withStreamChunkTimeout<T>(
  source: AsyncIterable<T>,
  timeoutMs: number = 3 * 60 * 1000,
): AsyncGenerator<T> {
  const iterator = source[Symbol.asyncIterator]()
  while (true) {
    const result = await Promise.race([
      iterator.next(),
      new Promise<never>((_, reject) => {
        const timer = setTimeout(() => reject(new StreamChunkTimeoutError(timeoutMs)), timeoutMs)
        if (typeof timer === 'object' && 'unref' in timer) {
          timer.unref()
        }
      }),
    ])
    if (result.done) return
    yield result.value
  }
}

function normalizeModelId(modelId: string): string {
  return modelId.trim().toLowerCase()
}

export function isLikelyOpenAIReasoningModel(modelId: string): boolean {
  const normalized = normalizeModelId(modelId)
  if (!normalized) return false
  return normalized.startsWith('o1')
    || normalized.startsWith('o3')
    || normalized.startsWith('o4')
    || normalized.startsWith('gpt-5')
}

export function shouldUseOpenAIReasoningProviderOptions(input: {
  providerKey: string
  providerApiMode?: 'gemini-sdk' | 'openai-official'
  modelId: string
}): boolean {
  if (!isLikelyOpenAIReasoningModel(input.modelId)) return false
  const normalizedProviderKey = input.providerKey.trim().toLowerCase()
  if (normalizedProviderKey === 'openai') return true
  if (normalizedProviderKey === 'openai-compatible' && input.providerApiMode === 'openai-official') {
    return true
  }
  return false
}
