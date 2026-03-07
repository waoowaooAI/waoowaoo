import { beforeEach, describe, expect, it, vi } from 'vitest'

const openAIState = vi.hoisted(() => ({
  list: vi.fn(),
}))

vi.mock('openai', () => ({
  default: class OpenAI {
    models = {
      list: openAIState.list,
    }
  },
}))

import { fetchProviderModels } from '@/lib/user-api/provider-models'

describe('user-api provider-models', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches and normalizes openai-compatible models with no-key and extra headers', async () => {
    openAIState.list.mockResolvedValue({
      data: [
        { id: 'gpt-4.1-mini' },
        { id: 'gpt-image-1' },
        { id: 'sora-2' },
        { id: 'gpt-4.1-mini' },
      ],
    })

    const result = await fetchProviderModels({
      providerId: 'openai-compatible:demo',
      baseUrl: 'https://proxy.example.com',
      apiKey: '',
      extraHeaders: { 'x-proxy-token': 'abc123' },
    })

    expect(result).toEqual([
      { modelId: 'gpt-4.1-mini', name: 'gpt-4.1-mini', type: 'llm' },
      { modelId: 'gpt-image-1', name: 'gpt-image-1', type: 'image' },
      { modelId: 'sora-2', name: 'sora-2', type: 'video' },
    ])
  })
})
