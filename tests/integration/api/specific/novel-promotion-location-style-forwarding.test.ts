import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireProjectAuth: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
    novelData: { id: 'novel-data-1' },
  })),
  requireProjectAuthLight: vi.fn(),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const prismaMock = vi.hoisted(() => ({
  novelPromotionLocation: {
    create: vi.fn(async () => ({ id: 'location-1' })),
    findUnique: vi.fn(async () => ({ id: 'location-1', images: [] })),
  },
  locationImage: {
    createMany: vi.fn<(input: { data: Array<{ imageIndex: number }> }) => Promise<{ count: number }>>(
      async () => ({ count: 0 }),
    ),
  },
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/task/resolve-locale', () => ({
  resolveTaskLocale: vi.fn(() => 'zh'),
}))

describe('api specific - novel promotion location style forwarding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not auto-generate images when creating location', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const mod = await import('@/app/api/novel-promotion/[projectId]/location/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/location',
      method: 'POST',
      headers: {
        'accept-language': 'zh-CN,zh;q=0.9',
      },
      body: {
        name: 'Old Town',
        description: '雨夜街道',
        artStyle: 'realistic',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects invalid artStyle before creating location', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const mod = await import('@/app/api/novel-promotion/[projectId]/location/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/location',
      method: 'POST',
      body: {
        name: 'Old Town',
        description: '雨夜街道',
        artStyle: 'anime',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVALID_PARAMS')
    expect(prismaMock.novelPromotionLocation.create).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('creates requested number of slots and forwards count', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const mod = await import('@/app/api/novel-promotion/[projectId]/location/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/location',
      method: 'POST',
      body: {
        name: 'Old Town',
        description: '雨夜街道',
        artStyle: 'realistic',
        count: 5,
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)

    const createManyArg = prismaMock.locationImage.createMany.mock.calls[0]?.[0] as {
      data?: Array<{ imageIndex: number }>
    } | undefined
    expect(createManyArg?.data?.map((item) => item.imageIndex)).toEqual([0, 1, 2, 3, 4])

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
