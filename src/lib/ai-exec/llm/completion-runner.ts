import OpenAI from 'openai'
import {
  getProviderConfig,
  getProviderKey,
} from '@/lib/api-config'
import { getInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import type { ChatCompletionOptions } from '@/lib/llm/types'
import { GoogleEmptyResponseError } from '@/lib/ai-providers/llm/google'
import {
  _ulogError,
  _ulogWarn,
  isRetryableError,
  llmLogger,
  logLlmRawInput,
  logLlmRawOutput,
  recordCompletionUsage,
  resolveLlmRuntimeModel,
} from '@/lib/llm/runtime-shared'
import { waitForRetryDelay } from '@/lib/ai-exec/governance'
import { executeLlmCompletionViaAdapter } from '@/lib/ai-providers/adapters/llm/execution'
import { describeLlmVariantBase } from '@/lib/ai-providers/adapters/llm/descriptor'
import { validateAiOptions } from '@/lib/ai-exec/normalize'

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  const record = toRecord(error)
  if (record && typeof record.message === 'string') return record.message
  return 'unknown error'
}

export async function runChatCompletion(
  userId: string,
  model: string | null | undefined,
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  options: ChatCompletionOptions = {},
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const internalCallbacks = getInternalLLMStreamCallbacks()
  if (internalCallbacks && !options.__skipAutoStream) {
    const { chatCompletionStream } = await import('@/lib/ai-providers/adapters/llm/stream-execution')
    return await chatCompletionStream(
      userId,
      model,
      messages,
      { ...options, __skipAutoStream: true },
      internalCallbacks,
    )
  }

  if (!model) {
    _ulogError('[LLM] 模型未配置，调用栈:', new Error().stack)
    throw new Error('ANALYSIS_MODEL_NOT_CONFIGURED: 请先在设置页面配置分析模型')
  }

  const selection = await resolveLlmRuntimeModel(userId, model)
  const resolvedModelId = selection.modelId
  const provider = selection.provider
  const providerKey = getProviderKey(provider).toLowerCase()
  const providerConfig = await getProviderConfig(userId, provider)

  validateAiOptions({
    schema: describeLlmVariantBase({ modality: 'llm', selection, executionMode: 'sync' }).optionSchema,
    options,
    context: `llm:${selection.modelKey}`,
  })

  const {
    temperature = 0.7,
    reasoning = true,
    reasoningEffort = 'high',
    maxRetries = 2,
  } = options
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
    stream: false,
    reasoning,
    reasoningEffort,
    temperature,
    action: options.action,
    messages,
  })

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const attemptStartedAt = Date.now()
    try {
      const result = await executeLlmCompletionViaAdapter({
        userId,
        providerKey,
        selection,
        providerConfig,
        messages,
        temperature,
        reasoning,
        reasoningEffort,
        maxRetries,
      })
      logLlmRawOutput({
        userId,
        projectId,
        provider: result.logProvider,
        modelId: resolvedModelId,
        modelKey: selection.modelKey,
        stream: false,
        action: options.action,
        text: result.text,
        reasoning: result.reasoning,
        usage: result.usage,
      })
      recordCompletionUsage(resolvedModelId, result.completion)
      llmLogger.info({
        action: 'llm.call.success',
        message: 'llm call succeeded',
        provider: result.logProvider,
        durationMs: Date.now() - attemptStartedAt,
        details: {
          model: resolvedModelId,
          attempt,
          maxRetries,
          ...(result.successDetails || {}),
        },
      })
      return result.completion
    } catch (error: unknown) {
      const normalizedError = error instanceof Error ? error : new Error(errorMessage(error))
      lastError = normalizedError
      llmLogger.warn({
        action: 'llm.call.attempt_failed',
        message: errorMessage(error) || 'llm call attempt failed',
        provider,
        durationMs: Date.now() - attemptStartedAt,
        details: {
          model: resolvedModelId,
          attempt,
          maxRetries,
        },
      })
      const errorBody = toRecord(toRecord(error)?.error) || toRecord(error)
      if (errorBody?.message === 'PROHIBITED_CONTENT' || errorBody?.code === 502) {
        _ulogError('[LLM] ❌ 内容安全检测失败 - Google AI Studio 拒绝处理此内容')
        throw new Error('SENSITIVE_CONTENT: 内容包含敏感信息,无法处理。请修改内容后重试')
      }

      // Google Gemini 返回空响应时，视为可重试错误（不抛出，继续重试循环）
      if (error instanceof GoogleEmptyResponseError) {
        _ulogWarn(`[LLM] Google 返回空响应，将重试 (${attempt}/${maxRetries + 1}): ${errorMessage(error)}`)
        if (attempt > maxRetries) break
        await waitForRetryDelay({ attempt, kind: 'llm' })
        continue
      }

      _ulogWarn(`[LLM] 调用失败 (${attempt}/${maxRetries + 1}): ${errorMessage(error)}`)

      if (!isRetryableError(error) || attempt > maxRetries) break
      await waitForRetryDelay({ attempt, kind: 'llm' })
    }
  }

  throw lastError || new Error('LLM 调用失败')
}
