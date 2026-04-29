import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveConfigMock = vi.hoisted(() => vi.fn(async () => ({
  providerId: 'openai-compatible:test-provider',
  baseUrl: 'https://compat.example.com/v1',
  apiKey: 'sk-test',
})))

vi.mock('@/lib/ai-providers/openai-compatible/errors', () => ({
  resolveOpenAICompatClientConfig: resolveConfigMock,
}))

import { executeOpenAiCompatibleImageGeneration } from '@/lib/ai-providers/openai-compatible/image'
import { generateImageViaOpenAICompatTemplate } from '@/lib/ai-providers/openai-compatible/user-template'

describe('openai-compat template image output urls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns all image urls when outputUrlsPath contains multiple values', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      data: [
        { url: 'https://cdn.test/1.png' },
        { url: 'https://cdn.test/2.png' },
      ],
    }), { status: 200 })) as unknown as typeof fetch

    const result = await generateImageViaOpenAICompatTemplate({
      userId: 'user-1',
      providerId: 'openai-compatible:test-provider',
      modelId: 'gpt-image-1',
      modelKey: 'openai-compatible:test-provider::gpt-image-1',
      prompt: 'draw a cat',
      profile: 'openai-compatible',
      template: {
        version: 1,
        mediaType: 'image',
        mode: 'sync',
        create: {
          method: 'POST',
          path: '/images/generations',
          contentType: 'application/json',
          bodyTemplate: {
            model: '{{model}}',
            prompt: '{{prompt}}',
          },
        },
        response: {
          outputUrlPath: '$.data[0].url',
          outputUrlsPath: '$.data',
        },
      },
    })

    expect(result).toEqual({
      success: true,
      imageUrl: 'https://cdn.test/1.png',
      imageUrls: ['https://cdn.test/1.png', 'https://cdn.test/2.png'],
    })
  })

  it('keeps single-url output compatible when outputUrlsPath has only one image', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      data: [{ url: 'https://cdn.test/only.png' }],
    }), { status: 200 })) as unknown as typeof fetch

    const result = await generateImageViaOpenAICompatTemplate({
      userId: 'user-1',
      providerId: 'openai-compatible:test-provider',
      modelId: 'gpt-image-1',
      modelKey: 'openai-compatible:test-provider::gpt-image-1',
      prompt: 'draw a cat',
      profile: 'openai-compatible',
      template: {
        version: 1,
        mediaType: 'image',
        mode: 'sync',
        create: {
          method: 'POST',
          path: '/images/generations',
          contentType: 'application/json',
          bodyTemplate: {
            model: '{{model}}',
            prompt: '{{prompt}}',
          },
        },
        response: {
          outputUrlsPath: '$.data',
        },
      },
    })

    expect(result).toEqual({
      success: true,
      imageUrl: 'https://cdn.test/only.png',
    })
  })

  it('maps aspect ratio to size and sends n=1 for image generation templates', async () => {
    globalThis.fetch = vi.fn(async (_url, init) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        model: 'gpt-image-2',
        prompt: 'draw a character',
        n: 1,
        size: '1536x1024',
        quality: 'low',
        format: 'jpeg',
      })
      return new Response(JSON.stringify({
        data: [{ b64_json: 'aW1hZ2UtYnl0ZXM=' }],
        output_format: 'png',
      }), { status: 200 })
    }) as unknown as typeof fetch

    const result = await executeOpenAiCompatibleImageGeneration({
      userId: 'user-1',
      selection: {
        provider: 'openai-compatible:test-provider',
        modelId: 'gpt-image-2',
        modelKey: 'openai-compatible:test-provider::gpt-image-2',
        variantSubKind: 'user-template',
        variantData: {
          compatMediaTemplate: {
            version: 1,
            mediaType: 'image',
            mode: 'sync',
            create: {
              method: 'POST',
              path: '/images/generations',
              contentType: 'application/json',
              bodyTemplate: {
                model: '{{model}}',
                prompt: '{{prompt}}',
              },
            },
            response: {
              outputUrlPath: '$.data[0].url',
            },
          },
        },
      },
      prompt: 'draw a character',
      options: {
        aspectRatio: '3:2',
      },
    })

    expect(result).toEqual({
      success: true,
      imageBase64: 'aW1hZ2UtYnl0ZXM=',
      imageUrl: 'data:image/png;base64,aW1hZ2UtYnl0ZXM=',
    })
  })

  it('reads image base64 from object-shaped template data payloads', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      data: { b64_json: 'b2JqZWN0LWltYWdl' },
      output_format: 'jpeg',
    }), { status: 200 })) as unknown as typeof fetch

    const result = await generateImageViaOpenAICompatTemplate({
      userId: 'user-1',
      providerId: 'openai-compatible:test-provider',
      modelId: 'gpt-image-2',
      modelKey: 'openai-compatible:test-provider::gpt-image-2',
      prompt: 'draw a character',
      profile: 'openai-compatible',
      template: {
        version: 1,
        mediaType: 'image',
        mode: 'sync',
        create: {
          method: 'POST',
          path: '/images/generations',
          contentType: 'application/json',
          bodyTemplate: {
            model: '{{model}}',
            prompt: '{{prompt}}',
          },
        },
        response: {
          outputUrlPath: '$.data[0].url',
        },
      },
    })

    expect(result).toEqual({
      success: true,
      imageBase64: 'b2JqZWN0LWltYWdl',
      imageUrl: 'data:image/jpeg;base64,b2JqZWN0LWltYWdl',
    })
  })
})
