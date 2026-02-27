import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiConfigMock = vi.hoisted(() => ({
  getProviderConfig: vi.fn(async () => ({ apiKey: 'fal-key' })),
}))

const asyncSubmitMock = vi.hoisted(() => ({
  submitFalTask: vi.fn(async () => 'req_kling_1'),
}))

vi.mock('@/lib/api-config', () => apiConfigMock)
vi.mock('@/lib/async-submit', () => asyncSubmitMock)

import { FalVideoGenerator } from '@/lib/generators/fal'

type KlingModelCase = {
  modelId: string
  endpoint: string
  imageField: 'image_url' | 'start_image_url'
}

const KLING_MODEL_CASES: KlingModelCase[] = [
  {
    modelId: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
    endpoint: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
    imageField: 'image_url',
  },
  {
    modelId: 'fal-ai/kling-video/v3/standard/image-to-video',
    endpoint: 'fal-ai/kling-video/v3/standard/image-to-video',
    imageField: 'start_image_url',
  },
  {
    modelId: 'fal-ai/kling-video/v3/pro/image-to-video',
    endpoint: 'fal-ai/kling-video/v3/pro/image-to-video',
    imageField: 'start_image_url',
  },
]

describe('FalVideoGenerator kling presets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiConfigMock.getProviderConfig.mockResolvedValue({ apiKey: 'fal-key' })
    asyncSubmitMock.submitFalTask.mockResolvedValue('req_kling_1')
  })

  it.each(KLING_MODEL_CASES)('submits $modelId to expected endpoint and payload', async ({ modelId, endpoint, imageField }) => {
    const generator = new FalVideoGenerator()
    const result = await generator.generate({
      userId: 'user-1',
      imageUrl: 'https://example.com/start.png',
      prompt: 'test prompt',
      options: {
        modelId,
        duration: 5,
        aspectRatio: '16:9',
      },
    })

    expect(result.success).toBe(true)
    expect(result.endpoint).toBe(endpoint)
    expect(result.requestId).toBe('req_kling_1')
    expect(result.externalId).toBe(`FAL:VIDEO:${endpoint}:req_kling_1`)
    expect(apiConfigMock.getProviderConfig).toHaveBeenCalledWith('user-1', 'fal')

    const submitCall = asyncSubmitMock.submitFalTask.mock.calls.at(0)
    expect(submitCall).toBeTruthy()
    if (!submitCall) {
      throw new Error('submitFalTask should be called')
    }

    expect(submitCall[0]).toBe(endpoint)
    expect(submitCall[2]).toBe('fal-key')

    const payload = submitCall[1] as Record<string, unknown>
    expect(payload.prompt).toBe('test prompt')
    expect(payload.duration).toBe('5')

    if (imageField === 'image_url') {
      expect(payload.image_url).toBe('https://example.com/start.png')
      expect(payload.start_image_url).toBeUndefined()
      expect(payload.negative_prompt).toBe('blur, distort, and low quality')
      expect(payload.cfg_scale).toBe(0.5)
      return
    }

    expect(payload.start_image_url).toBe('https://example.com/start.png')
    expect(payload.image_url).toBeUndefined()
    expect(payload.aspect_ratio).toBe('16:9')
    expect(payload.generate_audio).toBe(false)
  })
})
