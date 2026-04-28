import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveModelSelectionMock = vi.hoisted(() => vi.fn(async () => ({
  provider: 'openrouter',
  modelId: 'text-only',
  modelKey: 'openrouter::text-only',
  mediaType: 'llm',
  variantSubKind: 'official',
})))

const getProviderConfigMock = vi.hoisted(() => vi.fn(async () => ({
  id: 'openrouter',
  name: 'OpenRouter',
  apiKey: 'sk-test',
  baseUrl: 'https://openrouter.example/v1',
})))

const resolveRegisteredAiProviderMock = vi.hoisted(() => vi.fn(() => ({
  providerKey: 'openrouter',
})))

vi.mock('@/lib/user-api/runtime-config', () => ({
  resolveModelSelection: resolveModelSelectionMock,
  getProviderConfig: getProviderConfigMock,
}))

vi.mock('@/lib/ai-providers', () => ({
  resolveRegisteredAiProvider: resolveRegisteredAiProviderMock,
}))

import { runChatCompletionWithVision } from '@/lib/ai-exec/llm/vision-runner'

describe('vision provider support', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fails explicitly when provider has no vision adapter instead of falling back to OpenAI vision', async () => {
    await expect(runChatCompletionWithVision(
      'user-1',
      'openrouter::text-only',
      'describe image',
      ['https://example.com/image.png'],
    )).rejects.toThrow('AI_PROVIDER_MODALITY_UNSUPPORTED:openrouter:vision')

    expect(resolveRegisteredAiProviderMock).toHaveBeenCalledWith('openrouter')
    expect(getProviderConfigMock).toHaveBeenCalledWith('user-1', 'openrouter')
  })
})
