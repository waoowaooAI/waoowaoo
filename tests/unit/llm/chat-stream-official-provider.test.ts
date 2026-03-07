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

const logLlmRawInputMock = vi.hoisted(() => vi.fn())
const logLlmRawOutputMock = vi.hoisted(() => vi.fn())
const recordCompletionUsageMock = vi.hoisted(() => vi.fn())

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

import { chatCompletionStream } from '@/lib/llm/chat-stream'

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

    expect(completeBailianLlmMock).toHaveBeenCalledWith({
      modelId: 'qwen3.5-plus',
      messages: [{ role: 'user', content: 'hello' }],
      apiKey: 'bl-key',
      baseUrl: undefined,
      temperature: 0.7,
    })
    expect(runOpenAICompatChatCompletionMock).not.toHaveBeenCalled()
    expect(completeSiliconFlowLlmMock).not.toHaveBeenCalled()
    expect(onComplete).toHaveBeenCalledWith('stream-ok', undefined)
    expect(onChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'text',
        delta: 'stream-ok',
      }),
    )
    expect(completion.choices[0]?.message?.content).toBe('stream-ok')
    expect(recordCompletionUsageMock).toHaveBeenCalledTimes(1)
  })
})
