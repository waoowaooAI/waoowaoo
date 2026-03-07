import { beforeEach, describe, expect, it, vi } from 'vitest'

const createChatCompletionMock = vi.hoisted(() =>
  vi.fn(async () => ({
    id: 'chatcmpl_bailian',
    object: 'chat.completion',
    created: 1,
    model: 'qwen3.5-plus',
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

const openAiCtorMock = vi.hoisted(() =>
  vi.fn(() => ({
    chat: {
      completions: {
        create: createChatCompletionMock,
      },
    },
  })),
)

vi.mock('openai', () => ({
  default: openAiCtorMock,
}))

import { completeBailianLlm } from '@/lib/providers/bailian/llm'

describe('bailian llm provider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls dashscope openai-compatible endpoint for registered qwen model', async () => {
    const completion = await completeBailianLlm({
      modelId: 'qwen3.5-plus',
      messages: [{ role: 'user', content: 'hello' }],
      apiKey: 'bl-key',
      temperature: 0.2,
    })

    expect(openAiCtorMock).toHaveBeenCalledWith({
      apiKey: 'bl-key',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      timeout: 30_000,
    })
    expect(createChatCompletionMock).toHaveBeenCalledWith({
      model: 'qwen3.5-plus',
      messages: [{ role: 'user', content: 'hello' }],
      temperature: 0.2,
    })
    expect(completion.choices[0]?.message?.content).toBe('ok')
  })

  it('fails fast when model is not in official bailian catalog', async () => {
    await expect(
      completeBailianLlm({
        modelId: 'qwen-plus',
        messages: [{ role: 'user', content: 'hello' }],
        apiKey: 'bl-key',
      }),
    ).rejects.toThrow(/MODEL_NOT_REGISTERED/)

    expect(openAiCtorMock).not.toHaveBeenCalled()
    expect(createChatCompletionMock).not.toHaveBeenCalled()
  })
})
