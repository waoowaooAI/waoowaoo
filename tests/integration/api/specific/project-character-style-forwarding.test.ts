import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireProjectAuth: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
    projectData: { id: 'project-data-1' },
  })),
  requireProjectAuthLight: vi.fn(),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const prismaMock = vi.hoisted(() => ({
  projectCharacter: {
    create: vi.fn(async () => ({ id: 'character-1' })),
    findUnique: vi.fn(async () => ({ id: 'character-1', appearances: [] })),
  },
  characterAppearance: {
    create: vi.fn(async () => ({ id: 'appearance-1' })),
  },
}))

const envMock = vi.hoisted(() => ({
  getBaseUrl: vi.fn(() => 'http://localhost:3000'),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/env', () => envMock)
vi.mock('@/lib/task/resolve-locale', () => ({
  resolveTaskLocale: vi.fn(() => 'zh'),
}))

describe('api specific - novel promotion character style forwarding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not auto-generate images when creating by text prompt', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const mod = await import('@/app/api/projects/[projectId]/character/route')
    const req = buildMockRequest({
      path: '/api/projects/project-1/character',
      method: 'POST',
      headers: {
        'accept-language': 'zh-CN,zh;q=0.9',
      },
      body: {
        name: 'Hero',
        description: '主角设定',
        artStyle: 'realistic',
        count: 4,
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not inject default artStyle when creating from reference without override', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const mod = await import('@/app/api/projects/[projectId]/character/route')
    const req = buildMockRequest({
      path: '/api/projects/project-1/character',
      method: 'POST',
      headers: {
        'accept-language': 'zh-CN,zh;q=0.9',
      },
      body: {
        name: 'Hero',
        description: '主角设定',
        referenceImageUrl: 'https://example.com/ref.png',
        generateFromReference: true,
        count: 4,
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || '{}')) as Record<string, unknown>
    expect(body).not.toHaveProperty('artStyle')
  })

  it('forwards explicit artStyle override when creating from reference', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const mod = await import('@/app/api/projects/[projectId]/character/route')
    const req = buildMockRequest({
      path: '/api/projects/project-1/character',
      method: 'POST',
      body: {
        name: 'Hero',
        description: '主角设定',
        referenceImageUrl: 'https://example.com/ref.png',
        generateFromReference: true,
        artStyle: 'realistic',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || '{}')) as Record<string, unknown>
    expect(body.artStyle).toBe('realistic')
  })

  it('rejects invalid artStyle before creating character', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const mod = await import('@/app/api/projects/[projectId]/character/route')
    const req = buildMockRequest({
      path: '/api/projects/project-1/character',
      method: 'POST',
      body: {
        name: 'Hero',
        description: '主角设定',
        artStyle: 'anime',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVALID_PARAMS')
    expect(prismaMock.projectCharacter.create).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
