import OpenAI from 'openai'
import { ApiError } from '@/lib/api-errors'

export type LlmConnectionTestProvider =
  | 'openrouter'
  | 'google'
  | 'anthropic'
  | 'openai'
  | 'bailian'
  | 'siliconflow'
  | 'openai-compatible'
  | 'gemini-compatible'
  | 'custom'

export interface LlmConnectionTestResult {
  provider: LlmConnectionTestProvider
  message: string
  model?: string
  answer?: string
}

type TestConnectionPayload = {
  provider?: string
  apiKey?: string
  baseUrl?: string
  region?: string
  model?: string
}

type LlmConnectionTestPayload = {
  provider: LlmConnectionTestProvider
  apiKey: string
  baseUrl?: string
  model?: string
}

type LlmConnectionTestPartialResult = Pick<LlmConnectionTestResult, 'model' | 'answer'>

interface LlmConnectionTester {
  provider: LlmConnectionTestProvider
  test: (payload: LlmConnectionTestPayload) => Promise<LlmConnectionTestPartialResult>
}

const LLM_CONNECTION_TEST_PROVIDERS = new Set<LlmConnectionTestProvider>([
  'openrouter',
  'google',
  'anthropic',
  'openai',
  'bailian',
  'siliconflow',
  'openai-compatible',
  'gemini-compatible',
  'custom',
])

function isRegisteredLlmConnectionTestProvider(provider: string): provider is LlmConnectionTestProvider {
  return LLM_CONNECTION_TEST_PROVIDERS.has(provider as LlmConnectionTestProvider)
}

async function testGoogleAI(apiKey: string): Promise<LlmConnectionTestPartialResult> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
    { method: 'GET' },
  )
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Google AI 认证失败: ${error}`)
  }
  return {}
}

async function testOpenAICompatibleConnection(params: {
  apiKey: string
  baseURL?: string
  model?: string
  defaultHeaders?: { [name: string]: string }
}): Promise<LlmConnectionTestPartialResult> {
  const client = new OpenAI({
    apiKey: params.apiKey,
    baseURL: params.baseURL,
    timeout: 30000,
    defaultHeaders: params.defaultHeaders,
  })

  if (params.model) {
    const response = await client.chat.completions.create({
      model: params.model,
      messages: [{ role: 'user', content: '1+1等于几？只回答数字' }],
      max_tokens: 10,
      temperature: 0,
    })
    const answer = response.choices[0]?.message?.content?.trim() || ''
    return {
      model: response.model || params.model,
      answer,
    }
  }

  await client.models.list()
  return {}
}

async function testBailianLlmConnection(apiKey: string): Promise<LlmConnectionTestPartialResult> {
  const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/models', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Bailian probe failed (${response.status}): ${error}`)
  }
  const data = await response.json() as { data?: Array<{ id?: string }> }
  const firstModel = Array.isArray(data.data) ? data.data.find((item) => typeof item.id === 'string')?.id : undefined
  return { model: firstModel }
}

async function testSiliconFlowLlmConnection(apiKey: string): Promise<LlmConnectionTestPartialResult> {
  const modelsResponse = await fetch('https://api.siliconflow.cn/v1/models', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!modelsResponse.ok) {
    const error = await modelsResponse.text()
    throw new Error(`SiliconFlow models probe failed (${modelsResponse.status}): ${error}`)
  }

  const modelData = await modelsResponse.json() as { data?: Array<{ id?: string }> }
  const firstModel = Array.isArray(modelData.data) ? modelData.data.find((item) => typeof item.id === 'string')?.id : undefined

  const userInfoResponse = await fetch('https://api.siliconflow.cn/v1/user/info', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!userInfoResponse.ok) {
    const error = await userInfoResponse.text()
    throw new Error(`SiliconFlow user info probe failed (${userInfoResponse.status}): ${error}`)
  }
  const info = await userInfoResponse.json() as { balance?: unknown; data?: { balance?: unknown } }
  const rawBalance = info.balance ?? info.data?.balance
  const balance = typeof rawBalance === 'number'
    ? String(rawBalance)
    : typeof rawBalance === 'string' && rawBalance.trim()
      ? rawBalance.trim()
      : undefined

  return {
    model: firstModel,
    answer: typeof balance === 'string' ? `balance=${balance}` : 'userinfo_ok',
  }
}

function requireLlmConnectionBaseUrl(payload: LlmConnectionTestPayload): string {
  const baseUrl = typeof payload.baseUrl === 'string' ? payload.baseUrl.trim() : ''
  if (!baseUrl) {
    throw new Error('自定义渠道需要提供 baseUrl')
  }
  return baseUrl
}

const llmConnectionTesters: LlmConnectionTester[] = [
  {
    provider: 'openrouter',
    test: (payload) => testOpenAICompatibleConnection({
      apiKey: payload.apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      model: payload.model || undefined,
    }),
  },
  {
    provider: 'google',
    test: (payload) => testGoogleAI(payload.apiKey),
  },
  {
    provider: 'anthropic',
    test: (payload) => testOpenAICompatibleConnection({
      apiKey: payload.apiKey,
      baseURL: 'https://api.anthropic.com/v1',
      model: payload.model || 'claude-3-haiku-20240307',
      defaultHeaders: { 'anthropic-version': '2023-06-01' },
    }),
  },
  {
    provider: 'openai',
    test: (payload) => testOpenAICompatibleConnection({
      apiKey: payload.apiKey,
      model: payload.model || undefined,
    }),
  },
  {
    provider: 'bailian',
    test: (payload) => testBailianLlmConnection(payload.apiKey),
  },
  {
    provider: 'siliconflow',
    test: (payload) => testSiliconFlowLlmConnection(payload.apiKey),
  },
  {
    provider: 'openai-compatible',
    test: (payload) => testOpenAICompatibleConnection({
      apiKey: payload.apiKey,
      baseURL: requireLlmConnectionBaseUrl(payload),
      model: payload.model || undefined,
    }),
  },
  {
    provider: 'gemini-compatible',
    test: (payload) => testOpenAICompatibleConnection({
      apiKey: payload.apiKey,
      baseURL: requireLlmConnectionBaseUrl(payload),
      model: payload.model || undefined,
    }),
  },
  {
    provider: 'custom',
    test: (payload) => testOpenAICompatibleConnection({
      apiKey: payload.apiKey,
      baseURL: requireLlmConnectionBaseUrl(payload),
      model: payload.model || undefined,
    }),
  },
]

async function testRegisteredLlmConnection(payload: LlmConnectionTestPayload): Promise<LlmConnectionTestResult> {
  const tester = llmConnectionTesters.find((candidate) => candidate.provider === payload.provider)
  if (!tester) {
    throw new Error(`不支持的渠道: ${payload.provider}`)
  }
  const tested = await tester.test(payload)
  return {
    provider: payload.provider,
    message: `${payload.provider} 连接成功`,
    ...tested,
  }
}

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
