import { ApiError } from '@/lib/api-errors'
import {
  isRegisteredLlmConnectionTestProvider,
  testRegisteredLlmConnection,
  type LlmConnectionTestProvider,
  type LlmConnectionTestResult,
} from '@/lib/ai-providers'

type TestConnectionPayload = {
  provider?: string
  apiKey?: string
  baseUrl?: string
  region?: string
  model?: string
}

export type { LlmConnectionTestResult }

function normalizeProvider(payload: TestConnectionPayload): LlmConnectionTestProvider {
  const provider = typeof payload.provider === 'string' ? payload.provider.trim().toLowerCase() : ''
  if (!provider) {
    if (typeof payload.baseUrl === 'string' && payload.baseUrl.trim()) return 'custom'
    throw new ApiError('INVALID_PARAMS', { message: '缺少必要参数 provider' })
  }
  if (!isRegisteredLlmConnectionTestProvider(provider)) {
    throw new ApiError('INVALID_PARAMS', { message: `不支持的渠道: ${provider}` })
  }
  return provider
}

function requireApiKey(payload: TestConnectionPayload): string {
  const apiKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : ''
  if (!apiKey) {
    throw new ApiError('INVALID_PARAMS', { message: '缺少必要参数 apiKey' })
  }
  return apiKey
}

export async function testLlmConnection(payload: TestConnectionPayload): Promise<LlmConnectionTestResult> {
  const provider = normalizeProvider(payload)
  const apiKey = requireApiKey(payload)
  try {
    return await testRegisteredLlmConnection({
      provider,
      apiKey,
      baseUrl: typeof payload.baseUrl === 'string' ? payload.baseUrl.trim() : undefined,
      model: typeof payload.model === 'string' ? payload.model.trim() : '',
    })
  } catch (error) {
    if (error instanceof Error && error.message === '自定义渠道需要提供 baseUrl') {
      throw new ApiError('INVALID_PARAMS', { message: error.message })
    }
    throw error
  }
}

