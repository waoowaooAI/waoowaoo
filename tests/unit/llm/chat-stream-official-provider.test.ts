import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveLlmRuntimeModelMock = vi.hoisted(() =>
  vi.fn(async () => ({
    provider: 'bailian',
    modelId: 'qwen3.5-plus',
    modelKey: 'bailian::qwen3.5-plus',
  })),
)

const completeBailianLlmMock = vi.hoisted(() =>
  vi.fn(async () => ({
    id: 'chatcmpl_stream_mock',
    object: 'chat.completion',
    created: 1,
    model: 'qwen3.5-plus',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: 'stream-ok' },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 2,
      completion_tokens: 2,
      total_tokens: 4,
    },
  })),
)

const runBailianLlmStreamMock = vi.hoisted(() =>
  vi.fn(async () => ({
    completion: {
      id: 'chatcmpl_stream_mock',
      object: 'chat.completion',
      created: 1,
      model: 'qwen3.5-plus',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'stream-ok' },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 2,
        completion_tokens: 2,
        total_tokens: 4,
      },
    },
    logProvider: 'bailian',
    text: 'stream-ok',
    reasoning: '',
    usage: { promptTokens: 2, completionTokens: 2 },
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

const logLlmRawInputMock = vi.hoisted(() => vi.fn())
const logLlmRawOutputMock = vi.hoisted(() => vi.fn())
const recordCompletionUsageMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/user-api/runtime-config', () => ({
  getProviderConfig: getProviderConfigMock,
}))

vi.mock('@/lib/ai-providers/bailian/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai-providers/bailian/llm')>()
  return {
    ...actual,
    completeBailianLlm: completeBailianLlmMock,
    runBailianLlmStream: runBailianLlmStreamMock,
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
  completionUsageSummary: vi.fn(() => ({ promptTokens: 2, completionTokens: 2 })),
  llmLogger: {
    info: vi.fn(),
    warn: vi.fn(),
  },
  logLlmRawInput: logLlmRawInputMock,
  logLlmRawOutput: logLlmRawOutputMock,
  recordCompletionUsage: recordCompletionUsageMock,
  resolveLlmRuntimeModel: resolveLlmRuntimeModelMock,
}))

import { chatCompletionStream } from '@/lib/ai-exec/engine'

describe('llm chatCompletionStream official provider branch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('streams from bailian completion result and exits early', async () => {
    const onChunk = vi.fn()
    const onComplete = vi.fn()

    const completion = await chatCompletionStream(
      'user-1',
      'bailian::qwen3.5-plus',
      [{ role: 'user', content: 'hello' }],
      {},
      {
        onChunk,
        onComplete,
      },
    )

    expect(runBailianLlmStreamMock).toHaveBeenCalledTimes(1)
    expect(completeSiliconFlowLlmMock).not.toHaveBeenCalled()
    expect(completion.choices[0]?.message?.content).toBe('stream-ok')
    expect(recordCompletionUsageMock).toHaveBeenCalledTimes(1)
  })
})
