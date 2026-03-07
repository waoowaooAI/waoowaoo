import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireUserAuth: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const prismaMock = vi.hoisted(() => ({
  globalAssetFolder: {
    findUnique: vi.fn(async () => null),
  },
  globalLocation: {
    create: vi.fn(async () => ({ id: 'location-1' })),
    findUnique: vi.fn(async () => ({ id: 'location-1', images: [] })),
  },
  globalLocationImage: {
    createMany: vi.fn<(input: { data: Array<{ imageIndex: number }> }) => Promise<{ count: number }>>(
      async () => ({ count: 0 }),
    ),
  },
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

describe('api specific - asset hub location create', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not auto-generate images after creating location', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const mod = await import('@/app/api/asset-hub/locations/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/locations',
      method: 'POST',
      body: {
        name: 'Old Town',
        summary: '雨夜街道',
        artStyle: 'realistic',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
