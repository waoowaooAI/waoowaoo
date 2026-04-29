import { beforeEach, describe, expect, it, vi } from 'vitest'

type MockRuntimeModel = {
  provider: string
  modelId: string
  modelKey: string
  variantData?: { llmProtocol?: 'responses' | 'chat-completions' }
}

const resolveLlmRuntimeModelMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<MockRuntimeModel>>(async () => ({
    provider: 'openai-compatible:node-1',
    modelId: 'gpt-4.1-mini',
    modelKey: 'openai-compatible:node-1::gpt-4.1-mini',
    variantData: { llmProtocol: 'responses' },
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

vi.mock('@/lib/llm-observe/internal-stream-context', () => ({
  getInternalLLMStreamCallbacks: vi.fn(() => null),
}))

vi.mock('@/lib/user-api/runtime-config', () => ({
  getProviderConfig: getProviderConfigMock,
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
  _ulogError: vi.fn(),
  _ulogWarn: vi.fn(),
  completionUsageSummary: vi.fn(() => ({ promptTokens: 1, completionTokens: 1 })),
  isRetryableError: vi.fn(() => false),
  llmLogger: {
    info: vi.fn(),
    warn: vi.fn(),
  },
  logLlmRawInput: logLlmRawInputMock,
  logLlmRawOutput: logLlmRawOutputMock,
  recordCompletionUsage: recordCompletionUsageMock,
  resolveLlmRuntimeModel: resolveLlmRuntimeModelMock,
}))

import { chatCompletion } from '@/lib/ai-exec/engine'

describe('llm chatCompletion openai-compatible protocol routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses responses executor when llmProtocol=responses', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input)
      if (url.endsWith('/responses')) {
        return new Response(JSON.stringify({
          output_text: 'responses-ok',
          usage: { input_tokens: 1, output_tokens: 1 },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('unexpected', { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const completion = await chatCompletion(
      'user-1',
      'openai-compatible:node-1::gpt-4.1-mini',
      [{ role: 'user', content: 'hello' }],
      { temperature: 0.2 },
    )

    expect(completion.choices[0]?.message?.content).toBe('responses-ok')
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toContain('https://compat.example.com/v1/responses')
  })

  it('uses chat-completions executor when llmProtocol=chat-completions', async () => {
    resolveLlmRuntimeModelMock.mockResolvedValueOnce({
      provider: 'openai-compatible:node-1',
      modelId: 'gpt-4.1-mini',
      modelKey: 'openai-compatible:node-1::gpt-4.1-mini',
      variantData: { llmProtocol: 'chat-completions' },
    })

    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input)
      if (url.endsWith('/chat/completions')) {
        return new Response(JSON.stringify({
          id: 'chatcmpl_chat_1',
          object: 'chat.completion',
          created: 1,
          model: 'gpt-4.1-mini',
          choices: [{ index: 0, message: { role: 'assistant', content: 'chat-ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('unexpected', { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const completion = await chatCompletion(
      'user-1',
      'openai-compatible:node-1::gpt-4.1-mini',
      [{ role: 'user', content: 'hello' }],
      { temperature: 0.2 },
    )

    expect(completion.choices[0]?.message?.content).toBe('chat-ok')
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toContain('https://compat.example.com/v1/chat/completions')
  })

  it('fails fast when llmProtocol is missing for openai-compatible model', async () => {
    resolveLlmRuntimeModelMock.mockResolvedValueOnce({
      provider: 'openai-compatible:node-1',
      modelId: 'gpt-4.1-mini',
      modelKey: 'openai-compatible:node-1::gpt-4.1-mini',
    })

    const fetchMock = vi.fn(async () => new Response('unexpected', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      chatCompletion(
        'user-1',
        'openai-compatible:node-1::gpt-4.1-mini',
        [{ role: 'user', content: 'hello' }],
        { temperature: 0.2, maxRetries: 0 },
      ),
    ).rejects.toThrow('MODEL_LLM_PROTOCOL_REQUIRED')

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
