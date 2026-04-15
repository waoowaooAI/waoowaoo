import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authState = vi.hoisted(() => ({
  authenticated: true,
}))

const prismaMock = vi.hoisted(() => ({
  globalCharacter: {
    findFirst: vi.fn(),
  },
  globalCharacterAppearance: {
    create: vi.fn(async () => ({ id: 'appearance-new' })),
    findFirst: vi.fn(),
    update: vi.fn(async () => ({ id: 'appearance-1' })),
    deleteMany: vi.fn(async () => ({ count: 1 })),
  },
}))

vi.mock('@/lib/api-auth', () => {
  const unauthorized = () => new Response(
    JSON.stringify({ error: { code: 'UNAUTHORIZED' } }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  )

  return {
    isErrorResponse: (value: unknown) => value instanceof Response,
    requireUserAuth: async () => {
      if (!authState.authenticated) return unauthorized()
      return { session: { user: { id: 'user-1' } } }
    },
  }
})

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

describe('api specific - asset hub appearances route', () => {
  const routeContext = { params: Promise.resolve({}) }

  beforeEach(() => {
    vi.clearAllMocks()
    authState.authenticated = true

    prismaMock.globalCharacter.findFirst.mockResolvedValue({
      id: 'character-1',
      userId: 'user-1',
      appearances: [
        { id: 'appearance-1', appearanceIndex: 0, artStyle: 'realistic' },
      ],
    })
    prismaMock.globalCharacterAppearance.findFirst.mockResolvedValue({
      id: 'appearance-1',
      characterId: 'character-1',
      appearanceIndex: 0,
      description: 'old description',
      descriptions: JSON.stringify(['old description', 'variant description']),
    })
  })

  it('PATCH preserves description array length instead of rewriting fixed triple entries', async () => {
    const mod = await import('@/app/api/asset-hub/appearances/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/appearances',
      method: 'PATCH',
      body: {
        characterId: 'character-1',
        appearanceIndex: 0,
        description: 'updated description',
      },
    })

    const res = await mod.PATCH(req, routeContext)

    expect(res.status).toBe(200)
    expect(prismaMock.globalCharacterAppearance.update).toHaveBeenCalledWith({
      where: { id: 'appearance-1' },
      data: {
        description: 'updated description',
        descriptions: JSON.stringify(['updated description', 'variant description']),
      },
    })
  })

  it('POST initializes new appearance with a single description entry', async () => {
    const mod = await import('@/app/api/asset-hub/appearances/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/appearances',
      method: 'POST',
      body: {
        characterId: 'character-1',
        changeReason: '新造型',
        description: 'new description',
      },
    })

    const res = await mod.POST(req, routeContext)

    expect(res.status).toBe(200)
    expect(prismaMock.globalCharacterAppearance.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        description: 'new description',
        descriptions: JSON.stringify(['new description']),
      }),
    }))
  })
})
