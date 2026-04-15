import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import {
  authState,
  crudRoutes,
  invokeRouteMethod,
  prismaMock,
  resetCrudMocks,
  type RouteMethod,
} from '../helpers/crud-contract'

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
    requireProjectAuth: async (projectId: string) => {
      if (!authState.authenticated) return unauthorized()
      return {
        session: { user: { id: 'user-1' } },
        project: { id: projectId, userId: 'user-1' },
      }
    },
    requireProjectAuthLight: async (projectId: string) => {
      if (!authState.authenticated) return unauthorized()
      return {
        session: { user: { id: 'user-1' } },
        project: { id: projectId, userId: 'user-1' },
      }
    },
  }
})

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/storage', () => ({
  getSignedUrl: vi.fn((key: string) => `https://signed.example/${key}`),
}))

describe('api contract - asset crud routes (behavior)', () => {
  const assetRoutes = crudRoutes.filter((entry) =>
    entry.routeFile.includes('/asset-hub/') || entry.routeFile.includes('/select-character-image/') || entry.routeFile.includes('/select-location-image/'),
  )

  beforeEach(() => {
    resetCrudMocks()
  })

  it('crud route group exists', () => {
    expect(assetRoutes.length).toBeGreaterThan(0)
  })

  it('all asset crud route methods reject unauthenticated requests (no 2xx pass-through)', async () => {
    const methods: ReadonlyArray<RouteMethod> = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']
    let checkedMethodCount = 0

    for (const entry of assetRoutes) {
      const modulePath = `@/${entry.routeFile.replace(/^src\//, '').replace(/\.ts$/, '')}`
      const mod = await import(modulePath)
      for (const method of methods) {
        if (typeof mod[method] !== 'function') continue
        checkedMethodCount += 1
        const res = await invokeRouteMethod(entry.routeFile, method)
        expect(res.status, `${entry.routeFile}#${method} should reject unauthenticated`).toBeGreaterThanOrEqual(400)
        expect(res.status, `${entry.routeFile}#${method} should not be server-error on auth gate`).toBeLessThan(500)
      }
    }

    expect(checkedMethodCount).toBeGreaterThan(0)
  })

  it('PATCH /asset-hub/characters/[characterId] writes normalized fields to prisma.globalCharacter.update', async () => {
    authState.authenticated = true
    const mod = await import('@/app/api/asset-hub/characters/[characterId]/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/characters/character-1',
      method: 'PATCH',
      body: {
        name: '  Alice  ',
        aliases: ['A'],
        profileConfirmed: true,
        folderId: 'folder-1',
      },
    })

    const res = await mod.PATCH(req, { params: Promise.resolve({ characterId: 'character-1' }) })
    expect(res.status).toBe(200)
    expect(prismaMock.globalCharacter.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'character-1' },
      data: expect.objectContaining({
        name: 'Alice',
        aliases: ['A'],
        profileConfirmed: true,
        folderId: 'folder-1',
      }),
    }))
  })

  it('DELETE /asset-hub/characters/[characterId] deletes owned character and blocks non-owner', async () => {
    authState.authenticated = true
    const mod = await import('@/app/api/asset-hub/characters/[characterId]/route')

    prismaMock.globalCharacter.findUnique.mockResolvedValueOnce({
      id: 'character-1',
      userId: 'user-1',
    })
    const okReq = buildMockRequest({
      path: '/api/asset-hub/characters/character-1',
      method: 'DELETE',
    })
    const okRes = await mod.DELETE(okReq, { params: Promise.resolve({ characterId: 'character-1' }) })
    expect(okRes.status).toBe(200)
    expect(prismaMock.globalCharacter.delete).toHaveBeenCalledWith({ where: { id: 'character-1' } })

    prismaMock.globalCharacter.findUnique.mockResolvedValueOnce({
      id: 'character-1',
      userId: 'other-user',
    })
    const forbiddenReq = buildMockRequest({
      path: '/api/asset-hub/characters/character-1',
      method: 'DELETE',
    })
    const forbiddenRes = await mod.DELETE(forbiddenReq, { params: Promise.resolve({ characterId: 'character-1' }) })
    expect(forbiddenRes.status).toBe(403)
  })

  it('POST /projects/[projectId]/select-character-image writes selectedIndex and imageUrl key', async () => {
    authState.authenticated = true
    const mod = await import('@/app/api/projects/[projectId]/select-character-image/route')
    const req = buildMockRequest({
      path: '/api/projects/project-1/select-character-image',
      method: 'POST',
      body: {
        characterId: 'character-1',
        appearanceId: 'appearance-1',
        selectedIndex: 1,
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)
    expect(prismaMock.characterAppearance.update).toHaveBeenCalledWith({
      where: { id: 'appearance-1' },
      data: {
        selectedIndex: 1,
        imageUrl: 'cos/char-1.png',
      },
    })

    const payload = await res.json() as { success: boolean }
    expect(payload).toEqual({
      success: true,
    })
  })

  it('POST /projects/[projectId]/select-location-image toggles selected state and selectedImageId', async () => {
    authState.authenticated = true
    const mod = await import('@/app/api/projects/[projectId]/select-location-image/route')
    const req = buildMockRequest({
      path: '/api/projects/project-1/select-location-image',
      method: 'POST',
      body: {
        locationId: 'location-1',
        selectedIndex: 1,
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)
    expect(prismaMock.locationImage.updateMany).toHaveBeenCalledWith({
      where: { locationId: 'location-1' },
      data: { isSelected: false },
    })
    expect(prismaMock.locationImage.update).toHaveBeenCalledWith({
      where: { locationId_imageIndex: { locationId: 'location-1', imageIndex: 1 } },
      data: { isSelected: true },
    })
    expect(prismaMock.projectLocation.update).toHaveBeenCalledWith({
      where: { id: 'location-1' },
      data: { selectedImageId: 'img-1' },
    })
  })
})
