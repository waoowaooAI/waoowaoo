import { getCompletionParts } from '@/lib/ai-providers/shared/completion-parts'
import { buildAiProviderLlmResult } from '@/lib/ai-providers/shared/llm-result'
import { buildReasoningAwareContent, emitStreamChunk, emitStreamStage, resolveStreamStepMeta } from '@/lib/ai-providers/shared/llm-support'
import { runOpenAIBaseUrlLlmCompletion, runOpenAIBaseUrlLlmStream } from '@/lib/ai-providers/shared/openai-base-llm'
import type {
  AiProviderLlmResult,
  AiProviderLlmStreamContext,
} from '@/lib/ai-providers/runtime-types'
import OpenAI from 'openai'
import { buildOpenAIChatCompletion } from '@/lib/ai-providers/shared/openai-chat-completion'
import { createOpenAICompatClient, resolveOpenAICompatClientConfig } from '@/lib/ai-providers/openai-compatible/errors'

type OpenAICompatChatRequest = {
  userId: string
  providerId: string
  modelId: string
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  temperature: number
}

type ResponsesUsage = {
  promptTokens: number
  completionTokens: number
}

type ErrorWithStatus = Error & { status?: number }

type UnknownObject = { [key: string]: unknown }
type OpenAiCompatLlmProtocol = 'responses' | 'chat-completions'

function readOpenAiCompatLlmProtocol(value: unknown): OpenAiCompatLlmProtocol | null {
  return value === 'responses' || value === 'chat-completions' ? value : null
}

function isUnknownObject(value: unknown): value is UnknownObject {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function toEndpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

function collectText(node: unknown, acc: string[]) {
  if (typeof node === 'string') {
    acc.push(node)
    return
  }
  if (Array.isArray(node)) {
    node.forEach((item) => collectText(item, acc))
    return
  }
  if (!isUnknownObject(node)) return

  const type = typeof node.type === 'string' ? node.type : ''
  if (type.includes('reasoning')) return
  if (typeof node.output_text === 'string') acc.push(node.output_text)
  if (typeof node.text === 'string') acc.push(node.text)
  if (typeof node.content === 'string') acc.push(node.content)
  if (node.content !== undefined && typeof node.content !== 'string') collectText(node.content, acc)
  if (node.output !== undefined) collectText(node.output, acc)
}

function collectReasoning(node: unknown, acc: string[]) {
  if (Array.isArray(node)) {
    node.forEach((item) => collectReasoning(item, acc))
    return
  }
  if (!isUnknownObject(node)) return

  const type = typeof node.type === 'string' ? node.type : ''
  if (type.includes('reasoning')) {
    if (typeof node.text === 'string') acc.push(node.text)
    if (typeof node.content === 'string') acc.push(node.content)
    if (node.content !== undefined && typeof node.content !== 'string') {
      collectReasoning(node.content, acc)
    }
  }

  if (node.reasoning !== undefined) collectReasoning(node.reasoning, acc)
  if (node.reasoning_content !== undefined) collectReasoning(node.reasoning_content, acc)
  if (node.output !== undefined) collectReasoning(node.output, acc)
}

function extractResponsesText(payload: unknown): string {
  if (!isUnknownObject(payload)) return ''
  if (typeof payload.output_text === 'string') return payload.output_text

  const parts: string[] = []
  collectText(payload.output ?? payload, parts)
  return parts.join('')
}

function extractResponsesReasoning(payload: unknown): string {
  if (!isUnknownObject(payload)) return ''

  const parts: string[] = []
  collectReasoning(payload.output ?? payload, parts)
  return parts.join('')
}

function extractResponsesUsage(payload: unknown): ResponsesUsage {
  const usageNode = isUnknownObject(payload) && isUnknownObject(payload.usage) ? payload.usage : undefined
  const promptTokens = usageNode && typeof usageNode.input_tokens === 'number'
    ? usageNode.input_tokens
    : (usageNode && typeof usageNode.prompt_tokens === 'number' ? usageNode.prompt_tokens : 0)
  const completionTokens = usageNode && typeof usageNode.output_tokens === 'number'
    ? usageNode.output_tokens
    : (usageNode && typeof usageNode.completion_tokens === 'number' ? usageNode.completion_tokens : 0)
  return {
    promptTokens,
    completionTokens,
  }
}

export async function runOpenAICompatChatCompletion(input: OpenAICompatChatRequest): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const config = await resolveOpenAICompatClientConfig(input.userId, input.providerId)
  const client = createOpenAICompatClient(config)
  return await client.chat.completions.create({
    model: input.modelId,
    messages: input.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    temperature: input.temperature,
  })
}

export async function runOpenAICompatResponsesCompletion(input: OpenAICompatChatRequest): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const config = await resolveOpenAICompatClientConfig(input.userId, input.providerId)
  const endpoint = toEndpoint(config.baseUrl, '/responses')
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: input.modelId,
      input: input.messages.map((message) => ({
        role: message.role,
        content: [{ type: 'input_text', text: message.content }],
      })),
      temperature: input.temperature,
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    const error = new Error(
      `OPENAI_COMPAT_RESPONSES_FAILED: ${response.status} ${errorBody.slice(0, 300)}`,
    ) as ErrorWithStatus
    error.status = response.status
    throw error
  }

  const payload = await response.json() as unknown
  const text = extractResponsesText(payload)
  const reasoning = extractResponsesReasoning(payload)
  const usage = extractResponsesUsage(payload)

  return buildOpenAIChatCompletion(
    input.modelId,
    buildReasoningAwareContent(text, reasoning),
    usage,
  )
}

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
    const llmProtocol = readOpenAiCompatLlmProtocol(input.selection.variantData?.llmProtocol)
    if (!llmProtocol) {
      throw new Error(`MODEL_LLM_PROTOCOL_REQUIRED: ${input.selection.modelKey}`)
    }
    emitStreamStage(input.callbacks, stepMeta, 'streaming', 'openai-compat')
    const completion = llmProtocol === 'responses'
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
      logProvider: llmProtocol === 'responses' ? 'openai_compat_responses' : 'openai_compat_chat_completions',
      text: completionParts.text,
      reasoning: completionParts.reasoning,
      successDetails: { llmProtocol },
    })
  }

  return await runOpenAIBaseUrlLlmStream({
    ...input,
    providerName: 'openai_compatible',
    providerKey: 'openai-compatible',
  })
}
