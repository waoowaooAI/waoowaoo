import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const loggerInfoMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/logging/core', () => ({
  createScopedLogger: vi.fn(() => ({
    info: loggerInfoMock,
  })),
}))

import { installYunwuFetchTraceIfEnabled, uninstallYunwuFetchTraceForTest } from '@/lib/http/fetch-trace'

describe('yunwu fetch trace', () => {
  const originalEnv = process.env.HTTP_TRACE_YUNWU
  const baseFetch = vi.fn(async () => new Response('ok', { status: 200 }))

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.HTTP_TRACE_YUNWU = '1'
    vi.stubGlobal('fetch', baseFetch as unknown as typeof fetch)
  })

  afterEach(() => {
    uninstallYunwuFetchTraceForTest()
    process.env.HTTP_TRACE_YUNWU = originalEnv
  })

  it('does not log non-yunwu requests', async () => {
    installYunwuFetchTraceIfEnabled()

    await fetch('https://example.com/v1/ping')

    expect(baseFetch).toHaveBeenCalled()
    expect(loggerInfoMock).not.toHaveBeenCalled()
  })

  it('logs yunwu requests and redacts sensitive query params', async () => {
    installYunwuFetchTraceIfEnabled()

    await fetch('https://api.yunwu.ai/v1/ping?api_key=secret&x=1', {
      headers: {
        authorization: 'Bearer secret',
        'x-test': 'ok',
      },
    })

    expect(baseFetch).toHaveBeenCalled()
    expect(loggerInfoMock).toHaveBeenCalledWith(expect.objectContaining({
      audit: true,
      message: 'yunwu fetch traced',
      details: expect.objectContaining({
        url: expect.stringContaining('api_key=%5BREDACTED%5D'),
        requestHeaders: expect.objectContaining({
          authorization: '[REDACTED]',
          'x-test': 'ok',
        }),
      }),
    }))
  })
})

