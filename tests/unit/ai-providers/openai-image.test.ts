import { beforeEach, describe, expect, it, vi } from 'vitest'

const openAIConstructorMock = vi.hoisted(() => vi.fn())
const imagesGenerateMock = vi.hoisted(() => vi.fn(async () => ({
  data: [{ b64_json: 'aW1hZ2UtYnl0ZXM=' }],
})))
const imagesEditMock = vi.hoisted(() => vi.fn())
const getProviderConfigMock = vi.hoisted(() => vi.fn(async () => ({
  id: 'openai',
  name: 'OpenAI',
  apiKey: 'sk-openai',
  gatewayRoute: 'official' as const,
})))

vi.mock('openai', () => ({
  default: class OpenAI {
    images = {
      generate: imagesGenerateMock,
      edit: imagesEditMock,
    }

    constructor(input: unknown) {
      openAIConstructorMock(input)
    }
  },
  toFile: vi.fn(),
}))

vi.mock('@/lib/user-api/runtime-config', () => ({
  getProviderConfig: getProviderConfigMock,
}))

import { executeOpenAiImageGeneration } from '@/lib/ai-providers/openai/image'

describe('openai official image generation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls official OpenAI Images API for gpt-image-2 without OpenAI-compatible response_format', async () => {
    const result = await executeOpenAiImageGeneration({
      userId: 'user-1',
      selection: {
        provider: 'openai',
        modelId: 'gpt-image-2',
        modelKey: 'openai::gpt-image-2',
        variantSubKind: 'official',
      },
      prompt: 'draw a clean product icon',
      options: {
        size: '1024x1024',
        quality: 'high',
        outputFormat: 'webp',
        outputCompression: 75,
        background: 'auto',
        moderation: 'low',
      },
    })

    expect(getProviderConfigMock).toHaveBeenCalledWith('user-1', 'openai')
    expect(openAIConstructorMock).toHaveBeenCalledWith({ apiKey: 'sk-openai' })
    expect(imagesGenerateMock).toHaveBeenCalledWith({
      model: 'gpt-image-2',
      prompt: 'draw a clean product icon',
      output_format: 'webp',
      quality: 'high',
      size: '1024x1024',
      background: 'auto',
      moderation: 'low',
      output_compression: 75,
    })
    expect(result).toEqual({
      success: true,
      imageBase64: 'aW1hZ2UtYnl0ZXM=',
      imageUrl: 'data:image/webp;base64,aW1hZ2UtYnl0ZXM=',
    })
  })
})
