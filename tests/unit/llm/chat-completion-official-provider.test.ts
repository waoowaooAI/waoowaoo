import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveLlmRuntimeModelMock = vi.hoisted(() =>
  vi.fn(async () => ({
    provider: 'bailian',
    modelId: 'qwen3.5-flash',
    modelKey: 'bailian::qwen3.5-flash',
  })),
)

const completeBailianLlmMock = vi.hoisted(() =>
  vi.fn(async () => ({
    id: 'chatcmpl_mock',
    object: 'chat.completion',
    created: 1,
    model: 'qwen3.5-flash',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: 'ok' },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 1,
      completion_tokens: 1,
      total_tokens: 2,
    },
  })),
)

const completeSiliconFlowLlmMock = vi.hoisted(() =>
  vi.fn(async () => {
    throw new Error('siliconflow should not be called')
  }),
)

const runOpenAICompatChatCompletionMock = vi.hoisted(() =>
  vi.fn(async () => {
    throw new Error('openai-compat should not be called')
  }),
)

const getProviderConfigMock = vi.hoisted(() =>
  vi.fn(async () => ({
    id: 'bailian',
    name: 'Alibaba Bailian',
    apiKey: 'bl-key',
    baseUrl: undefined,
    gatewayRoute: 'official' as const,
  })),
)

const llmLoggerInfoMock = vi.hoisted(() => vi.fn())
const llmLoggerWarnMock = vi.hoisted(() => vi.fn())
const logLlmRawInputMock = vi.hoisted(() => vi.fn())
const logLlmRawOutputMock = vi.hoisted(() => vi.fn())
const recordCompletionUsageMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/llm-observe/internal-stream-context', () => ({
  getInternalLLMStreamCallbacks: vi.fn(() => null),
}))

vi.mock('@/lib/model-gateway', () => ({
  resolveModelGatewayRoute: vi.fn(() => 'official'),
  runOpenAICompatChatCompletion: runOpenAICompatChatCompletionMock,
}))

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: getProviderConfigMock,
  getProviderKey: vi.fn((providerId: string) => providerId),
}))

vi.mock('@/lib/providers/bailian', () => ({
  completeBailianLlm: completeBailianLlmMock,
}))

vi.mock('@/lib/providers/siliconflow', () => ({
  completeSiliconFlowLlm: completeSiliconFlowLlmMock,
}))

vi.mock('@/lib/llm/runtime-shared', () => ({
  _ulogError: vi.fn(),
  _ulogWarn: vi.fn(),
  completionUsageSummary: vi.fn(() => ({ promptTokens: 1, completionTokens: 1 })),
  isRetryableError: vi.fn(() => false),
  llmLogger: {
    info: llmLoggerInfoMock,
    warn: llmLoggerWarnMock,
  },
  logLlmRawInput: logLlmRawInputMock,
  logLlmRawOutput: logLlmRawOutputMock,
  recordCompletionUsage: recordCompletionUsageMock,
  resolveLlmRuntimeModel: resolveLlmRuntimeModelMock,
}))

import { chatCompletion } from '@/lib/llm/chat-completion'

describe('llm chatCompletion official provider branch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns completion from bailian official provider without falling through to baseUrl checks', async () => {
    const result = await chatCompletion(
      'user-1',
      'bailian::qwen3.5-flash',
      [{ role: 'user', content: 'hello' }],
      { temperature: 0.1 },
    )

    expect(completeBailianLlmMock).toHaveBeenCalledWith({
      modelId: 'qwen3.5-flash',
      messages: [{ role: 'user', content: 'hello' }],
      apiKey: 'bl-key',
      baseUrl: undefined,
      temperature: 0.1,
    })
    expect(runOpenAICompatChatCompletionMock).not.toHaveBeenCalled()
    expect(completeSiliconFlowLlmMock).not.toHaveBeenCalled()
    expect(result.choices[0]?.message?.content).toBe('ok')
    expect(recordCompletionUsageMock).toHaveBeenCalledTimes(1)
  })
})
