import { beforeEach, describe, expect, it, vi } from 'vitest'

const getProviderConfigMock = vi.hoisted(() =>
  vi.fn(async () => ({
    id: 'bailian',
    apiKey: 'bl-key',
  })),
)

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: getProviderConfigMock,
}))

import { generateBailianVideo } from '@/lib/providers/bailian/video'

describe('bailian video provider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits i2v task and returns async externalId', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        request_id: 'req-1',
        output: {
          task_id: 'task-123',
          task_status: 'PENDING',
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await generateBailianVideo({
      userId: 'user-1',
      imageUrl: 'https://example.com/frame.png',
      prompt: '让人物向前走',
      options: {
        provider: 'bailian',
        modelId: 'wan2.6-i2v-flash',
        modelKey: 'bailian::wan2.6-i2v-flash',
        duration: 5,
        resolution: '720P',
        promptExtend: true,
      },
    })

    expect(getProviderConfigMock).toHaveBeenCalledWith('user-1', 'bailian')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const firstCall = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit] | undefined
    expect(firstCall).toBeDefined()
    if (!firstCall) {
      throw new Error('missing fetch call')
    }
    const requestUrl = firstCall[0]
    const requestInit = firstCall[1]
    expect(requestUrl).toBe('https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis')
    expect(requestInit.method).toBe('POST')
    expect(requestInit.headers).toEqual({
      Authorization: 'Bearer bl-key',
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    })
    expect(requestInit.body).toBe(JSON.stringify({
      model: 'wan2.6-i2v-flash',
      input: {
        img_url: 'https://example.com/frame.png',
        prompt: '让人物向前走',
      },
      parameters: {
        resolution: '720P',
        prompt_extend: true,
        duration: 5,
      },
    }))
    expect(result).toEqual({
      success: true,
      async: true,
      requestId: 'task-123',
      externalId: 'BAILIAN:VIDEO:task-123',
    })
  })

  it('submits kf2v task with first and last frame', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        output: {
          task_id: 'task-kf2v-1',
          task_status: 'PENDING',
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await generateBailianVideo({
      userId: 'user-1',
      imageUrl: 'https://example.com/first.png',
      prompt: '让人物从左走到右',
      options: {
        provider: 'bailian',
        modelId: 'wan2.2-kf2v-flash',
        modelKey: 'bailian::wan2.2-kf2v-flash',
        lastFrameImageUrl: 'https://example.com/last.png',
        duration: 5,
      },
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const firstCall = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit] | undefined
    expect(firstCall).toBeDefined()
    if (!firstCall) {
      throw new Error('missing fetch call')
    }
    const requestUrl = firstCall[0]
    const requestInit = firstCall[1]
    expect(requestUrl).toBe('https://dashscope.aliyuncs.com/api/v1/services/aigc/image2video/video-synthesis')
    expect(requestInit.body).toBe(JSON.stringify({
      model: 'wan2.2-kf2v-flash',
      input: {
        first_frame_url: 'https://example.com/first.png',
        last_frame_url: 'https://example.com/last.png',
        prompt: '让人物从左走到右',
      },
      parameters: {
        duration: 5,
      },
    }))
    expect(result).toEqual({
      success: true,
      async: true,
      requestId: 'task-kf2v-1',
      externalId: 'BAILIAN:VIDEO:task-kf2v-1',
    })
  })

  it('fails fast when kf2v model misses last frame', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    await expect(
      generateBailianVideo({
        userId: 'user-1',
        imageUrl: 'https://example.com/first.png',
        prompt: 'test',
        options: {
          provider: 'bailian',
          modelId: 'wanx2.1-kf2v-plus',
          modelKey: 'bailian::wanx2.1-kf2v-plus',
        },
      }),
    ).rejects.toThrow(/BAILIAN_VIDEO_LAST_FRAME_IMAGE_URL_REQUIRED/)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails fast when options contain unsupported field', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    await expect(
      generateBailianVideo({
        userId: 'user-1',
        imageUrl: 'https://example.com/frame.png',
        prompt: 'test',
        options: {
          provider: 'bailian',
          modelId: 'wan2.6-i2v',
          modelKey: 'bailian::wan2.6-i2v',
          fps: 24,
        },
      }),
    ).rejects.toThrow(/BAILIAN_VIDEO_OPTION_UNSUPPORTED: fps/)

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
