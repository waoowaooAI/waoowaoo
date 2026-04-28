import type OpenAI from 'openai'
import { getCompletionParts } from '@/lib/ai-providers/shared/completion-parts'
import { emitStreamChunk, emitStreamStage, resolveStreamStepMeta } from '@/lib/ai-providers/shared/llm-support'
import { buildAiProviderLlmResult } from '@/lib/ai-providers/shared/llm-result'
import type { SiliconFlowLlmMessage } from './types'
import type {
  AiProviderLlmResult,
  AiProviderLlmStreamContext,
  AiProviderVisionExecutionContext,
} from '@/lib/ai-providers/runtime-types'
import { assertSiliconFlowOfficialModelSupported } from './models'

export interface SiliconFlowLlmCompletionParams {
  modelId: string
  messages: SiliconFlowLlmMessage[]
  apiKey: string
  baseUrl?: string
  temperature?: number
}

function assertRegistered(modelId: string): void {
  assertSiliconFlowOfficialModelSupported('llm', modelId)
}

export async function completeSiliconFlowLlm(
  params: SiliconFlowLlmCompletionParams,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  assertRegistered(params.modelId)
  throw new Error('OFFICIAL_PROVIDER_NOT_IMPLEMENTED: siliconflow llm')
}

export async function runSiliconFlowLlmCompletion(input: SiliconFlowLlmCompletionParams): Promise<AiProviderLlmResult> {
  const completion = await completeSiliconFlowLlm(input)
  const completionParts = getCompletionParts(completion)
  return buildAiProviderLlmResult({
    completion,
    logProvider: 'siliconflow',
    text: completionParts.text,
    reasoning: completionParts.reasoning,
  })
}

export async function runSiliconFlowLlmStream(input: AiProviderLlmStreamContext): Promise<AiProviderLlmResult> {
  const stepMeta = resolveStreamStepMeta(input.options)
  emitStreamStage(input.callbacks, stepMeta, 'streaming', 'siliconflow')
  const result = await runSiliconFlowLlmCompletion({
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
  emitStreamStage(input.callbacks, stepMeta, 'completed', 'siliconflow')
  input.callbacks?.onComplete?.(result.text, stepMeta)
  return result
}

export async function runSiliconFlowVisionCompletion(input: AiProviderVisionExecutionContext): Promise<AiProviderLlmResult> {
  return await runSiliconFlowLlmCompletion({
    modelId: input.selection.modelId,
    messages: [{ role: 'user', content: input.textPrompt || 'analyze vision content' }],
    apiKey: input.providerConfig.apiKey,
    baseUrl: input.providerConfig.baseUrl,
    temperature: input.temperature,
  })
}
