import { beforeEach, describe, expect, it, vi } from 'vitest'

const openAIState = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
}))

vi.mock('openai', () => ({
  default: class OpenAI {
    chat = {
      completions: {
        create: openAIState.create,
      },
    }

    models = {
      list: openAIState.list,
    }
  },
}))

import { testLlmConnection } from '@/lib/user-api/llm-test-connection'

describe('user-api llm test connection: openai-compatible no-key + custom headers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    openAIState.create.mockResolvedValue({
      model: 'gpt-4.1-mini',
      choices: [{ message: { content: 'pong' } }],
    })
  })

  it('accepts openai-compatible without apiKey when baseUrl + extraHeadersJson are provided', async () => {
    const result = await testLlmConnection({
      provider: 'openai-compatible',
      apiKey: '',
      baseUrl: 'https://proxy.example.com/v1',
      model: 'gpt-4.1-mini',
      extraHeadersJson: '{"x-proxy-token":"abc123"}',
    })

    expect(result.provider).toBe('openai-compatible')
    expect(result.message).toContain('连接成功')
    expect(openAIState.create).toHaveBeenCalledTimes(1)
  })
})
