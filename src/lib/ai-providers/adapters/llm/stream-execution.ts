import OpenAI from 'openai'
import { resolveRegisteredAiProvider } from '@/lib/ai-providers'
import {
  getProviderConfig,
  getProviderKey,
} from '@/lib/api-config'
import type { ChatCompletionOptions, ChatCompletionStreamCallbacks } from '@/lib/llm/types'
import {
  llmLogger,
  logLlmRawInput,
  logLlmRawOutput,
  recordCompletionUsage,
  resolveLlmRuntimeModel,
} from '@/lib/llm/runtime-shared'
import { describeLlmVariantBase } from '@/lib/ai-providers/adapters/llm/descriptor'
import { validateAiOptions } from '@/lib/ai-exec/normalize'
import { emitStreamStage, resolveStreamStepMeta } from '@/lib/llm/stream-helpers'

export async function chatCompletionStream(
  userId: string,
  model: string | null | undefined,
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  options: ChatCompletionOptions = {},
  callbacks?: ChatCompletionStreamCallbacks,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const streamStep = resolveStreamStepMeta(options)
  emitStreamStage(callbacks, streamStep, 'submit')
  if (!model) {
    const error = new Error('ANALYSIS_MODEL_NOT_CONFIGURED: 请先在设置页面配置分析模型')
    callbacks?.onError?.(error, streamStep)
    throw error
  }

  const selection = await resolveLlmRuntimeModel(userId, model)
  const resolvedModelId = selection.modelId
  const provider = selection.provider
  const providerKey = getProviderKey(provider).toLowerCase()
  const providerConfig = await getProviderConfig(userId, provider)

  validateAiOptions({
    schema: describeLlmVariantBase({ modality: 'llm', selection, executionMode: 'stream' }).optionSchema,
    options,
    context: `llm_stream:${selection.modelKey}`,
  })

  const temperature = options.temperature ?? 0.7
  const reasoning = options.reasoning ?? true
  const reasoningEffort = options.reasoningEffort || 'high'
  const projectId =
    typeof options.projectId === 'string' && options.projectId.trim().length > 0
      ? options.projectId.trim()
      : undefined
  logLlmRawInput({
    userId,
    projectId,
    provider: providerKey,
    modelId: resolvedModelId,
    modelKey: selection.modelKey,
    stream: true,
    reasoning,
    reasoningEffort,
    temperature,
    action: options.action,
    messages,
  })

  const providerRuntime = resolveRegisteredAiProvider(provider)
  if (!providerRuntime.streamLlm) {
    const error = new Error(`UNSUPPORTED_STREAM_PROVIDER: ${providerKey}`)
    callbacks?.onError?.(error, streamStep)
    throw error
  }

  try {
    const result = await providerRuntime.streamLlm({
      userId,
      selection,
      providerConfig,
      messages,
      options,
      callbacks,
    })
    logLlmRawOutput({
      userId,
      projectId,
      provider: result.logProvider,
      modelId: resolvedModelId,
      modelKey: selection.modelKey,
      stream: true,
      action: options.action,
      text: result.text,
      reasoning: result.reasoning,
      usage: result.usage ?? undefined,
    })
    recordCompletionUsage(resolvedModelId, result.completion)
    return result.completion
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    if (errMsg.includes('PROHIBITED_CONTENT') || errMsg.includes('request_body_blocked')) {
      const sensitiveError = new Error('SENSITIVE_CONTENT: 内容包含敏感信息,无法处理。请修改内容后重试')
      callbacks?.onError?.(sensitiveError, streamStep)
      throw sensitiveError
    }
    if (typeof llmLogger.error === 'function') {
      llmLogger.error({
        audit: false,
        action: 'llm.stream.failed',
        message: '[LLM] stream provider failed',
        userId,
        projectId,
        provider: providerKey,
        details: {
          model: { id: resolvedModelId, key: selection.modelKey },
          action: options.action ?? null,
        },
        error,
      })
    }
    callbacks?.onError?.(error, streamStep)
    throw error
  }
}
