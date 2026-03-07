import { beforeEach, describe, expect, it, vi } from 'vitest'

type MockRuntimeModel = {
  provider: string
  modelId: string
  modelKey: string
  llmProtocol: 'responses' | 'chat-completions' | undefined
}

const resolveLlmRuntimeModelMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<MockRuntimeModel>>(async () => ({
    provider: 'openai-compatible:node-1',
    modelId: 'gpt-4.1-mini',
    modelKey: 'openai-compatible:node-1::gpt-4.1-mini',
    llmProtocol: 'responses',
  })),
)

const runOpenAICompatResponsesCompletionMock = vi.hoisted(() =>
  vi.fn(async () => ({
    id: 'chatcmpl_responses_1',
    object: 'chat.completion',
    created: 1,
    model: 'gpt-4.1-mini',
    choices: [{ index: 0, message: { role: 'assistant', content: 'responses-stream' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  })),
)

const runOpenAICompatChatCompletionMock = vi.hoisted(() =>
  vi.fn(async () => ({
    id: 'chatcmpl_chat_1',
    object: 'chat.completion',
    created: 1,
    model: 'gpt-4.1-mini',
    choices: [{ index: 0, message: { role: 'assistant', content: 'chat-stream' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  })),
)

const getProviderConfigMock = vi.hoisted(() =>
  vi.fn(async () => ({
    id: 'openai-compatible:node-1',
    name: 'OpenAI Compatible',
    apiKey: 'sk-test',
    baseUrl: 'https://compat.example.com/v1',
    gatewayRoute: 'openai-compat' as const,
    apiMode: 'openai-official' as const,
  })),
)

const logLlmRawInputMock = vi.hoisted(() => vi.fn())
const logLlmRawOutputMock = vi.hoisted(() => vi.fn())
const recordCompletionUsageMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/model-gateway', () => ({
  resolveModelGatewayRoute: vi.fn(() => 'openai-compat'),
  runOpenAICompatChatCompletion: runOpenAICompatChatCompletionMock,
  runOpenAICompatResponsesCompletion: runOpenAICompatResponsesCompletionMock,
}))

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: getProviderConfigMock,
  getProviderKey: vi.fn((providerId: string) => providerId.split(':')[0] || providerId),
}))

vi.mock('@/lib/providers/bailian', () => ({
  completeBailianLlm: vi.fn(async () => {
    throw new Error('bailian should not be called')
  }),
}))

vi.mock('@/lib/providers/siliconflow', () => ({
  completeSiliconFlowLlm: vi.fn(async () => {
    throw new Error('siliconflow should not be called')
  }),
}))

vi.mock('@/lib/llm/runtime-shared', () => ({
  completionUsageSummary: vi.fn(() => ({ promptTokens: 1, completionTokens: 1 })),
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

describe('llm chatCompletionStream openai-compatible protocol routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses responses executor when llmProtocol=responses', async () => {
    const onChunk = vi.fn()
    const completion = await chatCompletionStream(
      'user-1',
      'openai-compatible:node-1::gpt-4.1-mini',
      [{ role: 'user', content: 'hello' }],
      { temperature: 0.2 },
      { onChunk },
    )

    expect(runOpenAICompatResponsesCompletionMock).toHaveBeenCalledTimes(1)
    expect(runOpenAICompatChatCompletionMock).not.toHaveBeenCalled()
    expect(completion.choices[0]?.message?.content).toBe('responses-stream')
    expect(onChunk).toHaveBeenCalled()
  })

  it('uses chat-completions executor when llmProtocol=chat-completions', async () => {
    resolveLlmRuntimeModelMock.mockResolvedValueOnce({
      provider: 'openai-compatible:node-1',
      modelId: 'gpt-4.1-mini',
      modelKey: 'openai-compatible:node-1::gpt-4.1-mini',
      llmProtocol: 'chat-completions',
    })

    const completion = await chatCompletionStream(
      'user-1',
      'openai-compatible:node-1::gpt-4.1-mini',
      [{ role: 'user', content: 'hello' }],
      { temperature: 0.2 },
      undefined,
    )

    expect(runOpenAICompatChatCompletionMock).toHaveBeenCalledTimes(1)
    expect(runOpenAICompatResponsesCompletionMock).not.toHaveBeenCalled()
    expect(completion.choices[0]?.message?.content).toBe('chat-stream')
  })

  it('fails fast when llmProtocol is missing for openai-compatible model', async () => {
    resolveLlmRuntimeModelMock.mockResolvedValueOnce({
      provider: 'openai-compatible:node-1',
      modelId: 'gpt-4.1-mini',
      modelKey: 'openai-compatible:node-1::gpt-4.1-mini',
      llmProtocol: undefined,
    })

    await expect(
      chatCompletionStream(
        'user-1',
        'openai-compatible:node-1::gpt-4.1-mini',
        [{ role: 'user', content: 'hello' }],
        { temperature: 0.2 },
        undefined,
      ),
    ).rejects.toThrow('MODEL_LLM_PROTOCOL_REQUIRED')

    expect(runOpenAICompatChatCompletionMock).not.toHaveBeenCalled()
    expect(runOpenAICompatResponsesCompletionMock).not.toHaveBeenCalled()
  })
})
