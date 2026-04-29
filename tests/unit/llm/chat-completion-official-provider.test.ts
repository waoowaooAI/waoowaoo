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

const runBailianLlmCompletionMock = vi.hoisted(() =>
  vi.fn(async () => ({
    completion: {
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
    },
    logProvider: 'bailian',
    text: 'ok',
    reasoning: '',
    usage: { promptTokens: 1, completionTokens: 1 },
  })),
)

const completeSiliconFlowLlmMock = vi.hoisted(() =>
  vi.fn(async () => {
    throw new Error('siliconflow should not be called')
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

vi.mock('@/lib/user-api/runtime-config', () => ({
  getProviderConfig: getProviderConfigMock,
}))

vi.mock('@/lib/ai-providers/bailian/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai-providers/bailian/llm')>()
  return {
    ...actual,
    completeBailianLlm: completeBailianLlmMock,
    runBailianLlmCompletion: runBailianLlmCompletionMock,
  }
})

vi.mock('@/lib/ai-providers/siliconflow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai-providers/siliconflow')>()
  return {
    ...actual,
    completeSiliconFlowLlm: completeSiliconFlowLlmMock,
  }
})

vi.mock('@/lib/ai-exec/llm-runtime', () => ({
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

import { chatCompletion } from '@/lib/ai-exec/engine'

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

    expect(runBailianLlmCompletionMock).toHaveBeenCalledTimes(1)
    expect(completeSiliconFlowLlmMock).not.toHaveBeenCalled()
    expect(result.choices[0]?.message?.content).toBe('ok')
    expect(recordCompletionUsageMock).toHaveBeenCalledTimes(1)
  })
})
