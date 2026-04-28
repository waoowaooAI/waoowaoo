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

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: getProviderConfigMock,
  getProviderKey: vi.fn((providerId: string) => providerId.split(':')[0] || providerId),
}))

vi.mock('@/lib/ai-providers/bailian', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai-providers/bailian')>()
  return {
    ...actual,
    completeBailianLlm: vi.fn(async () => {
      throw new Error('bailian should not be called')
    }),
  }
})

vi.mock('@/lib/ai-providers/siliconflow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai-providers/siliconflow')>()
  return {
    ...actual,
    completeSiliconFlowLlm: vi.fn(async () => {
      throw new Error('siliconflow should not be called')
    }),
  }
})

vi.mock('@/lib/ai-exec/llm-runtime', () => ({
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

import { chatCompletionStream } from '@/lib/ai-exec/engine'

describe('llm chatCompletionStream openai-compatible protocol routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses responses executor when llmProtocol=responses', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input)
      if (url.endsWith('/responses')) {
        return new Response(JSON.stringify({
          output_text: 'responses-stream',
          usage: { input_tokens: 1, output_tokens: 1 },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('unexpected', { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const onChunk = vi.fn()
    const completion = await chatCompletionStream(
      'user-1',
      'openai-compatible:node-1::gpt-4.1-mini',
      [{ role: 'user', content: 'hello' }],
      { temperature: 0.2 },
      { onChunk },
    )

    expect(completion.choices[0]?.message?.content).toBe('responses-stream')
    expect(onChunk).toHaveBeenCalled()
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toContain('https://compat.example.com/v1/responses')
  })

  it('uses chat-completions executor when llmProtocol=chat-completions', async () => {
    resolveLlmRuntimeModelMock.mockResolvedValueOnce({
      provider: 'openai-compatible:node-1',
      modelId: 'gpt-4.1-mini',
      modelKey: 'openai-compatible:node-1::gpt-4.1-mini',
      llmProtocol: 'chat-completions',
    })

    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input)
      if (url.endsWith('/chat/completions')) {
        return new Response(JSON.stringify({
          id: 'chatcmpl_chat_1',
          object: 'chat.completion',
          created: 1,
          model: 'gpt-4.1-mini',
          choices: [{ index: 0, message: { role: 'assistant', content: 'chat-stream' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('unexpected', { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const completion = await chatCompletionStream(
      'user-1',
      'openai-compatible:node-1::gpt-4.1-mini',
      [{ role: 'user', content: 'hello' }],
      { temperature: 0.2 },
      undefined,
    )

    expect(completion.choices[0]?.message?.content).toBe('chat-stream')
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toContain('https://compat.example.com/v1/chat/completions')
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
  })
})
