import { beforeEach, describe, expect, it, vi } from 'vitest'

const openAiState = vi.hoisted(() => ({
  createOpenAI: vi.fn((settings: { apiKey?: string; baseURL?: string; name?: string }) => ({
    chat: vi.fn((modelId: string) => ({
      provider: 'openai',
      modelId,
      settings,
    })),
  })),
}))

const anthropicState = vi.hoisted(() => ({
  createAnthropic: vi.fn((settings: { apiKey?: string; baseURL?: string; name?: string }) => ({
    chat: vi.fn((modelId: string) => ({
      provider: 'anthropic',
      modelId,
      settings,
    })),
  })),
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: openAiState.createOpenAI,
}))

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: anthropicState.createAnthropic,
}))

import { createRegisteredLanguageModel } from '@/lib/ai-providers'

describe('ai provider language model registry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates OpenAI language models from registered provider configs', () => {
    const model = createRegisteredLanguageModel({
      providerKey: 'openai',
      selection: {
        provider: 'openai',
        modelId: 'gpt-4.1',
        modelKey: 'openai::gpt-4.1',
      },
      providerConfig: {
        id: 'openai',
        name: 'OpenAI',
        apiKey: 'sk-openai',
      },
    })

    expect(model).toMatchObject({
      provider: 'openai',
      modelId: 'gpt-4.1',
    })
    expect(openAiState.createOpenAI).toHaveBeenCalledWith({
      apiKey: 'sk-openai',
      name: 'openai',
    })
  })

  it('creates Anthropic language models from registered provider configs', () => {
    const model = createRegisteredLanguageModel({
      providerKey: 'anthropic',
      selection: {
        provider: 'anthropic',
        modelId: 'claude-3-5-sonnet-latest',
        modelKey: 'anthropic::claude-3-5-sonnet-latest',
      },
      providerConfig: {
        id: 'anthropic',
        name: 'Anthropic',
        apiKey: 'sk-anthropic',
        baseUrl: 'https://anthropic.example/v1',
      },
    })

    expect(model).toMatchObject({
      provider: 'anthropic',
      modelId: 'claude-3-5-sonnet-latest',
    })
    expect(anthropicState.createAnthropic).toHaveBeenCalledWith({
      apiKey: 'sk-anthropic',
      baseURL: 'https://anthropic.example/v1',
      name: 'anthropic',
    })
  })
})
