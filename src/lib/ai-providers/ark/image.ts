import { getInternalBaseUrl } from '@/lib/env'
import { logError as _ulogError, logInfo as _ulogInfo } from '@/lib/logging/core'
import { createImageGenerator } from '@/lib/ai-providers/adapters/media/generators/factory'
import type { AiProviderImageExecutionContext } from '@/lib/ai-providers/runtime-types'

const ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'

const DEFAULT_TIMEOUT_MS = 60 * 1000
const MAX_RETRIES = 3
const RETRY_DELAY_BASE_MS = 2000

function normalizeError(error: unknown): { name?: string; message: string; cause?: string; status?: number } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      cause: error.cause ? String(error.cause) : undefined,
    }
  }
  if (typeof error === 'object' && error !== null) {
    const e = error as { name?: unknown; message?: unknown; cause?: unknown; status?: unknown }
    return {
      name: typeof e.name === 'string' ? e.name : undefined,
      message: typeof e.message === 'string' ? e.message : 'Unknown error',
      cause: e.cause ? String(e.cause) : undefined,
      status: typeof e.status === 'number' ? e.status : undefined,
    }
  }
  return { message: 'Unknown error' }
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number,
  timeoutMs: number,
  logPrefix: string,
): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const fullUrl = url.startsWith('/') ? `${getInternalBaseUrl()}${url}` : url
      const response = await fetch(fullUrl, {
        ...options,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (response.ok) return response

      try {
        const errorText = await response.text()
        lastError = new Error(`HTTP ${response.status}: ${errorText}`)
      } catch {
        lastError = new Error(`HTTP ${response.status}`)
      }
    } catch (error: unknown) {
      clearTimeout(timeoutId)
      const normalized = normalizeError(error)
      lastError = error instanceof Error ? error : new Error(normalized.message)

      const errorDetails = {
        attempt,
        maxRetries,
        errorName: normalized.name,
        errorMessage: normalized.message,
        errorCause: normalized.cause,
        isAbortError: normalized.name === 'AbortError',
        isTimeoutError: normalized.name === 'AbortError' || normalized.message.includes('timeout'),
        isNetworkError: normalized.message.includes('fetch failed') || normalized.name === 'TypeError',
      }

      _ulogError(`${logPrefix} 第 ${attempt}/${maxRetries} 次尝试失败:`, JSON.stringify(errorDetails, null, 2))
    }

    if (attempt < maxRetries) {
      const delayMs = RETRY_DELAY_BASE_MS * Math.pow(2, attempt - 1)
      _ulogInfo(`${logPrefix} 等待 ${delayMs / 1000} 秒后重试...`)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  throw lastError || new Error(`${logPrefix} 所有 ${maxRetries} 次重试都失败`)
}

export async function fetchWithTimeoutAndRetry(
  url: string,
  options?: RequestInit & { timeoutMs?: number; maxRetries?: number; logPrefix?: string },
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, maxRetries = MAX_RETRIES, logPrefix = '[Fetch]', ...fetchOptions } = options || {}
  return fetchWithRetry(url, fetchOptions, maxRetries, timeoutMs, logPrefix)
}

export interface ArkImageGenerationRequest {
  model: string
  prompt: string
  response_format?: 'url' | 'b64_json'
  size?: string
  aspect_ratio?: string
  watermark?: boolean
  image?: string[]
  sequential_image_generation?: 'enabled' | 'disabled'
  stream?: boolean
}

export interface ArkImageGenerationResponse {
  data: Array<{ url?: string; b64_json?: string }>
}

export async function arkImageGeneration(
  request: ArkImageGenerationRequest,
  options?: { apiKey: string; timeoutMs?: number; maxRetries?: number; logPrefix?: string },
): Promise<ArkImageGenerationResponse> {
  if (!options?.apiKey) throw new Error('请配置火山引擎 API Key')

  const { apiKey, timeoutMs = DEFAULT_TIMEOUT_MS, maxRetries = MAX_RETRIES, logPrefix = '[Ark Image]' } = options
  const url = `${ARK_BASE_URL}/images/generations`

  _ulogInfo(`${logPrefix} 开始图片生成请求, 模型: ${request.model}`)
  _ulogInfo(
    `${logPrefix} 请求参数:`,
    JSON.stringify(
      {
        model: request.model,
        size: request.size,
        aspect_ratio: request.aspect_ratio,
        watermark: request.watermark,
        imageCount: request.image?.length || 0,
        promptLength: request.prompt?.length || 0,
      },
      null,
      2,
    ),
  )

  const response = await fetchWithRetry(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(request),
    },
    maxRetries,
    timeoutMs,
    logPrefix,
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`${logPrefix} 图片生成失败: ${response.status} - ${errorText}`)
  }

  const data = (await response.json()) as ArkImageGenerationResponse
  _ulogInfo(`${logPrefix} 图片生成成功`)
  return data
}

export const ARK_API_TIMEOUT_MS = DEFAULT_TIMEOUT_MS
export const ARK_API_MAX_RETRIES = MAX_RETRIES

export async function executeArkImageGeneration(input: AiProviderImageExecutionContext) {
  const generator = createImageGenerator(input.selection.provider, input.selection.modelId)
  return await generator.generate({
    userId: input.userId,
    prompt: input.prompt,
    referenceImages: input.options?.referenceImages,
    options: {
      ...(input.options || {}),
      provider: input.selection.provider,
      modelId: input.selection.modelId,
      modelKey: input.selection.modelKey,
    },
  })
}
