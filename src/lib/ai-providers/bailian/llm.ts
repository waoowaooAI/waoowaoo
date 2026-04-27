import OpenAI from 'openai'
import {
  assertOfficialModelRegistered,
  type OfficialModelModality,
} from '@/lib/ai-providers/official/model-registry'
import { getCompletionParts } from '@/lib/ai-providers/shared/completion-parts'
import { emitStreamChunk, emitStreamStage, resolveStreamStepMeta } from '@/lib/ai-providers/shared/llm-support'
import { ensureBailianCatalogRegistered } from './catalog'
import { buildAiProviderLlmResult } from '@/lib/ai-providers/shared/llm-result'
import type { BailianLlmMessage } from './types'
import type {
  AiProviderLlmResult,
  AiProviderLlmStreamContext,
  AiProviderVisionExecutionContext,
} from '@/lib/ai-providers/runtime-types'

export interface BailianLlmCompletionParams {
  modelId: string
  messages: BailianLlmMessage[]
  apiKey: string
  baseUrl?: string
  temperature?: number
}

function assertRegistered(modelId: string): void {
  ensureBailianCatalogRegistered()
  assertOfficialModelRegistered({
    provider: 'bailian',
    modality: 'llm' satisfies OfficialModelModality,
    modelId,
  })
}

export async function completeBailianLlm(
  _params: BailianLlmCompletionParams,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  assertRegistered(_params.modelId)
  const baseURL = typeof _params.baseUrl === 'string' && _params.baseUrl.trim()
    ? _params.baseUrl.trim()
    : 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  const client = new OpenAI({
    apiKey: _params.apiKey,
    baseURL,
    timeout: 30_000,
  })
  const completion = await client.chat.completions.create({
    model: _params.modelId,
    messages: _params.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    temperature: _params.temperature ?? 0.7,
  })
  return completion as OpenAI.Chat.Completions.ChatCompletion
}

export async function runBailianLlmCompletion(input: BailianLlmCompletionParams): Promise<AiProviderLlmResult> {
  const completion = await completeBailianLlm(input)
  const completionParts = getCompletionParts(completion)
  return buildAiProviderLlmResult({
    completion,
    logProvider: 'bailian',
    text: completionParts.text,
    reasoning: completionParts.reasoning,
  })
}

export async function runBailianLlmStream(input: AiProviderLlmStreamContext): Promise<AiProviderLlmResult> {
  const stepMeta = resolveStreamStepMeta(input.options)
  emitStreamStage(input.callbacks, stepMeta, 'streaming', 'bailian')
  const result = await runBailianLlmCompletion({
    modelId: input.selection.modelId,
    messages: input.messages,
    apiKey: input.providerConfig.apiKey,
    baseUrl: input.providerConfig.baseUrl,
    temperature: input.options.temperature ?? 0.7,
  })
  let seq = 1
  if (result.reasoning) {
    emitStreamChunk(input.callbacks, stepMeta, {
      kind: 'reasoning',
      delta: result.reasoning,
      seq,
      lane: 'reasoning',
    })
    seq += 1
  }
  if (result.text) {
    emitStreamChunk(input.callbacks, stepMeta, {
      kind: 'text',
      delta: result.text,
      seq,
      lane: 'main',
    })
  }
  emitStreamStage(input.callbacks, stepMeta, 'completed', 'bailian')
  input.callbacks?.onComplete?.(result.text, stepMeta)
  return result
}

export async function runBailianVisionCompletion(input: AiProviderVisionExecutionContext): Promise<AiProviderLlmResult> {
  return await runBailianLlmCompletion({
    modelId: input.selection.modelId,
    messages: [{ role: 'user', content: input.textPrompt || 'analyze vision content' }],
    apiKey: input.providerConfig.apiKey,
    baseUrl: input.providerConfig.baseUrl,
    temperature: input.temperature,
  })
}
