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

vi.mock('@/lib/async-submit', () => ({
  queryFalStatus: vi.fn(),
}))

vi.mock('@/lib/async-task-utils', () => ({
  queryGeminiBatchStatus: vi.fn(),
  queryGoogleVideoStatus: vi.fn(),
  querySeedanceVideoStatus: vi.fn(),
}))

import { pollAsyncTask } from '@/lib/async-poll'

describe('async poll bailian task', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns pending when task is running', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        output: {
          task_status: 'RUNNING',
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await pollAsyncTask('BAILIAN:VIDEO:task-running', 'user-1')

    expect(getProviderConfigMock).toHaveBeenCalledWith('user-1', 'bailian')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://dashscope.aliyuncs.com/api/v1/tasks/task-running',
      {
        headers: {
          Authorization: 'Bearer bl-key',
        },
      },
    )
    expect(result).toEqual({ status: 'pending' })
  })

  it('returns completed with video url when task succeeded', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        output: {
          task_status: 'SUCCEEDED',
          video_url: 'https://video.example/result.mp4',
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await pollAsyncTask('BAILIAN:VIDEO:task-success', 'user-1')

    expect(result).toEqual({
      status: 'completed',
      resultUrl: 'https://video.example/result.mp4',
      videoUrl: 'https://video.example/result.mp4',
      imageUrl: undefined,
    })
  })

  it('returns failed when task succeeded but no media url', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        output: {
          task_status: 'SUCCEEDED',
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await pollAsyncTask('BAILIAN:VIDEO:task-no-url', 'user-1')

    expect(result).toEqual({
      status: 'failed',
      error: 'Bailian: 任务完成但未返回结果URL',
    })
  })

  it('returns output code/message when task failed', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        output: {
          task_status: 'FAILED',
          code: 'InternalError.DownloadException',
          message: 'Unknown error occurred while downloading the file.',
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await pollAsyncTask('BAILIAN:VIDEO:task-failed', 'user-1')

    expect(result).toEqual({
      status: 'failed',
      error: 'Bailian: InternalError.DownloadException',
    })
  })
})
