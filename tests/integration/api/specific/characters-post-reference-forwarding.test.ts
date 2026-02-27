import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireUserAuth: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const prismaMock = vi.hoisted(() => ({
  globalAssetFolder: {
    findUnique: vi.fn(),
  },
  globalCharacter: {
    create: vi.fn(async () => ({ id: 'character-1', userId: 'user-1' })),
    findUnique: vi.fn(async () => ({
      id: 'character-1',
      userId: 'user-1',
      name: 'Hero',
      appearances: [],
    })),
  },
  globalCharacterAppearance: {
    create: vi.fn(async () => ({ id: 'appearance-1' })),
  },
}))

const mediaAttachMock = vi.hoisted(() => ({
  attachMediaFieldsToGlobalCharacter: vi.fn(async (value: unknown) => value),
}))

const mediaServiceMock = vi.hoisted(() => ({
  resolveMediaRefFromLegacyValue: vi.fn(async () => null),
}))

const envMock = vi.hoisted(() => ({
  getBaseUrl: vi.fn(() => 'http://localhost:3000'),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/media/attach', () => mediaAttachMock)
vi.mock('@/lib/media/service', () => mediaServiceMock)
vi.mock('@/lib/env', () => envMock)

describe('api specific - characters POST forwarding to reference task', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.globalAssetFolder.findUnique.mockResolvedValue(null)
  })

  it('forwards locale and accept-language into background reference task payload', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const mod = await import('@/app/api/asset-hub/characters/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/characters',
      method: 'POST',
      headers: {
        'accept-language': 'zh-CN,zh;q=0.9',
      },
      body: {
        name: 'Hero',
        generateFromReference: true,
        referenceImageUrl: 'https://example.com/ref.png',
        customDescription: '冷静，黑发',
      },
    })

    const res = await mod.POST(req)
    expect(res.status).toBe(200)

    const calledUrl = fetchMock.mock.calls[0]?.[0]
    const calledInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    expect(String(calledUrl)).toContain('/api/asset-hub/reference-to-character')
    expect((calledInit?.headers as Record<string, string>)['Accept-Language']).toBe('zh-CN,zh;q=0.9')

    const rawBody = calledInit?.body
    expect(typeof rawBody).toBe('string')
    const forwarded = JSON.parse(String(rawBody)) as {
      locale?: string
      meta?: { locale?: string }
      customDescription?: string
      referenceImageUrls?: string[]
      appearanceId?: string
      characterId?: string
    }

    expect(forwarded.locale).toBe('zh')
    expect(forwarded.meta?.locale).toBe('zh')
    expect(forwarded.customDescription).toBe('冷静，黑发')
    expect(forwarded.referenceImageUrls).toEqual(['https://example.com/ref.png'])
    expect(forwarded.characterId).toBe('character-1')
    expect(forwarded.appearanceId).toBe('appearance-1')
  })

  it('returns unauthorized when auth fails', async () => {
    authMock.requireUserAuth.mockResolvedValueOnce(
      NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 }),
    )
    const mod = await import('@/app/api/asset-hub/characters/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/characters',
      method: 'POST',
      body: { name: 'Hero' },
    })

    const res = await mod.POST(req)
    expect(res.status).toBe(401)
  })
})
