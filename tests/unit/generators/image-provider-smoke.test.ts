import { beforeEach, describe, expect, it, vi } from 'vitest'

const googleGenerateContentMock = vi.hoisted(() => vi.fn())
const getProviderConfigMock = vi.hoisted(() => vi.fn())
const getImageBase64CachedMock = vi.hoisted(() => vi.fn(async () => 'data:image/png;base64,UkVG'))
const arkImageGenerationMock = vi.hoisted(() => vi.fn())
const normalizeToBase64ForGenerationMock = vi.hoisted(() => vi.fn(async () => 'UkVG'))

vi.mock('@google/genai', () => ({
  GoogleGenAI: class GoogleGenAI {
    models = {
      generateContent: googleGenerateContentMock,
    }
  },
  HarmCategory: {
    HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
    HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
    HARM_CATEGORY_SEXUALLY_EXPLICIT: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    HARM_CATEGORY_DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT',
  },
  HarmBlockThreshold: {
    BLOCK_NONE: 'BLOCK_NONE',
  },
}))

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: getProviderConfigMock,
}))

vi.mock('@/lib/image-cache', () => ({
  getImageBase64Cached: getImageBase64CachedMock,
}))

vi.mock('@/lib/ark-api', () => ({
  arkImageGeneration: arkImageGenerationMock,
}))

vi.mock('@/lib/media/outbound-image', () => ({
  normalizeToBase64ForGeneration: normalizeToBase64ForGenerationMock,
}))

import { ArkSeedreamGenerator } from '@/lib/generators/ark'
import { GeminiCompatibleImageGenerator } from '@/lib/generators/image/gemini-compatible'
import { GoogleGeminiImageGenerator } from '@/lib/generators/image/google'

describe('image provider smoke tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Google Gemini 官方文生图可用 -> 返回 data URL', async () => {
    getProviderConfigMock.mockResolvedValueOnce({
      id: 'google',
      apiKey: 'google-key',
    })
    googleGenerateContentMock.mockResolvedValueOnce({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: 'R09PR0xF',
                },
              },
            ],
          },
        },
      ],
    })

    const generator = new GoogleGeminiImageGenerator('gemini-3-pro-image-preview')
    const result = await generator.generate({
      userId: 'user-1',
      prompt: 'draw a mountain',
      options: {
        aspectRatio: '3:4',
      },
    })

    expect(result).toEqual({
      success: true,
      imageBase64: 'R09PR0xF',
      imageUrl: 'data:image/png;base64,R09PR0xF',
    })
    expect(googleGenerateContentMock).toHaveBeenCalledWith({
      model: 'gemini-3-pro-image-preview',
      contents: [{ parts: [{ text: 'draw a mountain' }] }],
      config: expect.objectContaining({
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: '3:4' },
      }),
    })
  })

  it('Seedream 图生图可用 -> 返回 ARK 图片 URL', async () => {
    getProviderConfigMock.mockResolvedValueOnce({
      id: 'ark',
      apiKey: 'ark-key',
    })
    arkImageGenerationMock.mockResolvedValueOnce({
      data: [{ url: 'https://seedream.test/image.png' }],
    })

    const generator = new ArkSeedreamGenerator()
    const result = await generator.generate({
      userId: 'user-1',
      prompt: 'refine this style',
      referenceImages: ['https://example.com/ref.png'],
      options: {
        modelId: 'doubao-seedream-4-5-251128',
        aspectRatio: '3:4',
      },
    })

    expect(result).toEqual({
      success: true,
      imageUrl: 'https://seedream.test/image.png',
    })
    expect(arkImageGenerationMock).toHaveBeenCalledWith({
      model: 'doubao-seedream-4-5-251128',
      prompt: 'refine this style',
      sequential_image_generation: 'disabled',
      response_format: 'url',
      stream: false,
      watermark: false,
      size: '3544x4728',
      image: ['UkVG'],
    }, {
      apiKey: 'ark-key',
      logPrefix: '[ARK Image]',
    })
  })

  it('Gemini 兼容层文生图可用 -> 直连 Gemini SDK 协议返回图片', async () => {
    getProviderConfigMock.mockResolvedValueOnce({
      id: 'gemini-compatible:gm-1',
      apiKey: 'gm-key',
      baseUrl: 'https://gm.test',
    })
    googleGenerateContentMock.mockResolvedValueOnce({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/webp',
                  data: 'R01fVEVYVA==',
                },
              },
            ],
          },
        },
      ],
    })

    const generator = new GeminiCompatibleImageGenerator('gemini-2.5-flash-image-preview', 'gemini-compatible:gm-1')
    const result = await generator.generate({
      userId: 'user-1',
      prompt: 'draw a cat',
      options: {
        aspectRatio: '1:1',
      },
    })

    expect(result).toEqual({
      success: true,
      imageBase64: 'R01fVEVYVA==',
      imageUrl: 'data:image/webp;base64,R01fVEVYVA==',
    })
    expect(googleGenerateContentMock).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash-image-preview',
      contents: [{ parts: [{ text: 'draw a cat' }] }],
      config: expect.objectContaining({
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: '1:1' },
      }),
    })
  })

  it('Gemini 兼容层图生图可用 -> 参考图会注入 inlineData', async () => {
    getProviderConfigMock.mockResolvedValueOnce({
      id: 'gemini-compatible:gm-1',
      apiKey: 'gm-key',
      baseUrl: 'https://gm.test',
    })
    googleGenerateContentMock.mockResolvedValueOnce({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: 'R01fSTJJPQ==',
                },
              },
            ],
          },
        },
      ],
    })

    const generator = new GeminiCompatibleImageGenerator('gemini-2.5-flash-image-preview', 'gemini-compatible:gm-1')
    const result = await generator.generate({
      userId: 'user-1',
      prompt: 'restyle this portrait',
      referenceImages: ['/api/files/ref-image'],
      options: {
        resolution: '2K',
      },
    })

    expect(result).toEqual({
      success: true,
      imageBase64: 'R01fSTJJPQ==',
      imageUrl: 'data:image/png;base64,R01fSTJJPQ==',
    })
    const call = googleGenerateContentMock.mock.calls[0]
    expect(call).toBeTruthy()
    if (!call) {
      throw new Error('Gemini generateContent should be called')
    }
    const content = call[0] as {
      contents: Array<{ parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> }>
      config: { imageConfig?: { imageSize?: string } }
    }
    expect(content.contents[0].parts[0].inlineData).toEqual({ mimeType: 'image/png', data: 'UkVG' })
    expect(content.contents[0].parts[1].text).toBe('restyle this portrait')
    expect(content.config.imageConfig).toEqual({ imageSize: '2K' })
  })
})
