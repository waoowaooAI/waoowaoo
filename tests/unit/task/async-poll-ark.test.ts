import { beforeEach, describe, expect, it, vi } from 'vitest'

const getProviderConfigMock = vi.hoisted(() =>
  vi.fn(async () => ({
    id: 'ark',
    apiKey: 'ark-key',
  })),
)

const asyncTaskUtilsMock = vi.hoisted(() => ({
  queryGeminiBatchStatus: vi.fn(),
  queryGoogleVideoStatus: vi.fn(),
  querySeedanceVideoStatus: vi.fn(),
}))

vi.mock('@/lib/user-api/runtime-config', () => ({
  getProviderConfig: getProviderConfigMock,
  getUserModels: vi.fn(),
}))

vi.mock('@/lib/async-submit', () => ({
  queryFalStatus: vi.fn(),
}))

vi.mock('@/lib/async-task-utils', () => asyncTaskUtilsMock)

import { pollAsyncTask } from '@/lib/async-poll'

describe('async poll ark task', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes through actual video token usage from Ark polling', async () => {
    asyncTaskUtilsMock.querySeedanceVideoStatus.mockResolvedValueOnce({
      status: 'completed',
      videoUrl: 'https://ark.example/result.mp4',
      actualVideoTokens: 108000,
    })

    const result = await pollAsyncTask('ARK:VIDEO:task-1', 'user-1')

    expect(getProviderConfigMock).toHaveBeenCalledWith('user-1', 'ark')
    expect(asyncTaskUtilsMock.querySeedanceVideoStatus).toHaveBeenCalledWith('task-1', 'ark-key')
    expect(result).toEqual({
      status: 'completed',
      resultUrl: 'https://ark.example/result.mp4',
      videoUrl: 'https://ark.example/result.mp4',
      actualVideoTokens: 108000,
      error: undefined,
    })
  })
})
