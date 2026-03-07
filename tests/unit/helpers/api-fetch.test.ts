import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api-fetch'

describe('apiFetch locale header injection', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('injects Accept-Language for internal /api requests', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }))
    globalThis.fetch = fetchMock

    await apiFetch('/api/tasks?status=running', { method: 'GET' })

    const init = fetchMock.mock.calls[0]?.[1]
    const headers = new Headers(init?.headers)
    expect(headers.get('Accept-Language')).toBe('zh')
  })

  it('uses pathname locale and does not override explicit Accept-Language', async () => {
    vi.stubGlobal('window', {
      location: {
        pathname: '/en/workspace',
      },
    })

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }))
    globalThis.fetch = fetchMock

    await apiFetch('/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': 'ja',
      },
      body: JSON.stringify({ ok: true }),
    })

    const init = fetchMock.mock.calls[0]?.[1]
    const headers = new Headers(init?.headers)
    expect(headers.get('Accept-Language')).toBe('ja')
  })

  it('does not inject locale header for non-internal URLs', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }))
    globalThis.fetch = fetchMock

    await apiFetch('https://example.com/health', { method: 'GET' })

    const init = fetchMock.mock.calls[0]?.[1]
    const headers = new Headers(init?.headers)
    expect(headers.has('Accept-Language')).toBe(false)
  })
})
