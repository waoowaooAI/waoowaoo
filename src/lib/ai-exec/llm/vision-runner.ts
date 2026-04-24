import OpenAI from 'openai'
import {
  getProviderConfig,
  getProviderKey,
} from '@/lib/api-config'
import { getInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import type { ChatCompletionOptions, ChatCompletionStreamCallbacks } from '@/lib/llm/types'
import { emitChunkedText } from '@/lib/llm/stream-helpers'
import { getCompletionParts } from '@/lib/llm/completion-parts'
import {
  _ulogError,
  _ulogInfo,
  _ulogWarn,
  isRetryableError,
  llmLogger,
  recordCompletionUsage,
  resolveLlmRuntimeModel,
} from '@/lib/llm/runtime-shared'
import { waitForRetryDelay } from '@/lib/ai-exec/governance'
import { executeVisionCompletionViaAdapter } from '@/lib/ai-providers/adapters/llm/execution'
import { describeLlmVariantBase } from '@/lib/ai-providers/adapters/llm/descriptor'
import { validateAiOptions } from '@/lib/ai-exec/normalize'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === 'string') return error.message
  if (typeof error === 'object' && error !== null) {
    const candidate = (error as { message?: unknown }).message
    if (typeof candidate === 'string') return candidate
  }
  return 'unknown error'
}

function getErrorBody(error: unknown): { message?: unknown; code?: unknown } {
  if (typeof error !== 'object' || error === null) return {}
  const root = error as { error?: unknown; message?: unknown; code?: unknown }
  if (typeof root.error === 'object' && root.error !== null) {
    return root.error as { message?: unknown; code?: unknown }
  }
  return root
}

export async function runChatCompletionWithVision(
  userId: string,
  model: string | null | undefined,
  textPrompt: string,
  imageUrls: string[] = [],
  options: ChatCompletionOptions = {},
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const internalCallbacks = getInternalLLMStreamCallbacks()
  if (internalCallbacks && !options.__skipAutoStream) {
    return await runChatCompletionWithVisionStream(
      userId,
      model,
      textPrompt,
      imageUrls,
      { ...options, __skipAutoStream: true },
      internalCallbacks,
    )
  }

  if (!model) {
    _ulogError('[LLM Vision] 模型未配置，调用栈:', new Error().stack)
    throw new Error('ANALYSIS_MODEL_NOT_CONFIGURED: 请先在设置页面配置分析模型')
  }

  const selection = await resolveLlmRuntimeModel(userId, model)
  const resolvedModelId = selection.modelId
  const provider = selection.provider
  const providerKey = getProviderKey(provider).toLowerCase()

  validateAiOptions({
    schema: describeLlmVariantBase({ modality: 'vision', selection, executionMode: 'sync' }).optionSchema,
    options,
    context: `vision:${selection.modelKey}`,
  })

  const { temperature = 0.7, maxRetries = 2, reasoning = true } = options

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const attemptStartedAt = Date.now()
    try {
      const providerConfig = await getProviderConfig(userId, provider)
      const result = await executeVisionCompletionViaAdapter({
        userId,
        providerKey,
        selection,
        providerConfig,
        textPrompt,
        imageUrls,
        temperature,
        reasoning,
      })
      recordCompletionUsage(resolvedModelId, result.completion)
      llmLogger.info({
        action: 'llm.vision.success',
        message: 'llm vision call succeeded',
        provider: result.logProvider,
        durationMs: Date.now() - attemptStartedAt,
        details: {
          model: resolvedModelId,
          attempt,
          maxRetries,
          imageCount: imageUrls.length,
        },
      })
      return result.completion
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(getErrorMessage(error))
      const message = getErrorMessage(error)
      llmLogger.warn({
        action: 'llm.vision.attempt_failed',
        message: message || 'llm vision attempt failed',
        provider,
        durationMs: Date.now() - attemptStartedAt,
        details: {
          model: resolvedModelId,
          attempt,
          maxRetries,
          imageCount: imageUrls.length,
        },
      })
      const errorBody = getErrorBody(error)
      if (errorBody?.message === 'PROHIBITED_CONTENT' || errorBody?.code === 502) {
        _ulogError('[LLM Vision] ❌ 内容安全检测失败 - Google AI Studio 拒绝处理此内容')
        throw new Error('SENSITIVE_CONTENT: 图片或提示词包含敏感信息,无法处理')
      }

      _ulogWarn(`[LLM Vision] 调用失败 (${attempt}/${maxRetries + 1}): ${message}`)
      if (!isRetryableError(error) || attempt > maxRetries) break
      await waitForRetryDelay({ attempt, kind: 'vision' })
    }
  }
  throw lastError || new Error('LLM Vision 调用失败')
}

export async function runChatCompletionWithVisionStream(
  userId: string,
  model: string | null | undefined,
  textPrompt: string,
  imageUrls: string[] = [],
  options: ChatCompletionOptions = {},
  callbacks?: ChatCompletionStreamCallbacks,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  callbacks?.onStage?.({ stage: 'submit' })
  try {
    callbacks?.onStage?.({ stage: 'fallback' })
    const completion = await runChatCompletionWithVision(userId, model, textPrompt, imageUrls, {
      ...options,
      __skipAutoStream: true,
    })
    const completionParts = getCompletionParts(completion)
    let seq = 1
    if (completionParts.reasoning) {
      seq = emitChunkedText(completionParts.reasoning, callbacks, 'reasoning', seq)
    }
    emitChunkedText(completionParts.text, callbacks, 'text', seq)
    callbacks?.onStage?.({ stage: 'completed' })
    callbacks?.onComplete?.(completionParts.text)
    return completion
  } catch (error) {
    callbacks?.onError?.(error, undefined)
    throw error
  }
}
