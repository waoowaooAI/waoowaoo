import OpenAI from 'openai'
import {
  getProviderConfig,
} from '@/lib/api-config'
import { getProviderKey } from '@/lib/ai-registry/selection'
import type { ChatCompletionOptions, ChatCompletionStreamCallbacks } from '@/lib/ai-registry/types'
import { getInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import { GoogleEmptyResponseError } from '@/lib/ai-providers/llm/google'
import {
  _ulogError,
  _ulogWarn,
  isRetryableError,
  llmLogger,
  logLlmRawInput,
  logLlmRawOutput,
  recordCompletionUsage,
  completionUsageSummary,
  resolveLlmRuntimeModel,
} from '@/lib/ai-exec/llm-runtime'
import { waitForRetryDelay } from '@/lib/ai-exec/governance'
import { describeLlmVariantBase } from '@/lib/ai-providers/adapters/llm/descriptor'
import { validateAiOptions } from '@/lib/ai-exec/normalize'
import { resolveRegisteredAiProvider } from '@/lib/ai-providers'
import { emitStreamStage, resolveStreamStepMeta } from '@/lib/ai-providers/shared/llm-support'
import type { AiLlmExecutionInput, AiLlmExecutionResult } from '@/lib/ai-registry/types'

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  const record = toRecord(error)
  if (record && typeof record.message === 'string') return record.message
  return 'unknown error'
}

async function executeLlmCompletionViaAdapter(
  input: AiLlmExecutionInput,
): Promise<AiLlmExecutionResult> {
  const provider = resolveRegisteredAiProvider(input.selection.provider)
  if (!provider.completeLlm) {
    throw new Error(`UNSUPPORTED_LLM_PROVIDER: ${input.providerKey}`)
  }
  const result = await provider.completeLlm(input)
  return {
    ...result,
    usage: result.usage ?? completionUsageSummary(result.completion),
  }
}

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

export async function runChatCompletion(
  userId: string,
  model: string | null | undefined,
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  options: ChatCompletionOptions = {},
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const internalCallbacks = getInternalLLMStreamCallbacks()
  if (internalCallbacks && !options.__skipAutoStream) {
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
