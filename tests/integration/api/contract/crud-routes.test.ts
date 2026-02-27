import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ROUTE_CATALOG } from '../../../contracts/route-catalog'
import { buildMockRequest } from '../../../helpers/request'

type RouteMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

type AuthState = {
  authenticated: boolean
}

type RouteContext = {
  params: Promise<Record<string, string>>
}

const authState = vi.hoisted<AuthState>(() => ({
  authenticated: false,
}))

const prismaMock = vi.hoisted(() => ({
  globalCharacter: {
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  globalAssetFolder: {
    findUnique: vi.fn(),
  },
  characterAppearance: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  novelPromotionLocation: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  locationImage: {
    updateMany: vi.fn(),
    update: vi.fn(),
  },
  novelPromotionClip: {
    update: vi.fn(),
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
    requireProjectAuth: async (projectId: string) => {
      if (!authState.authenticated) return unauthorized()
      return {
        session: { user: { id: 'user-1' } },
        project: { id: projectId, userId: 'user-1', mode: 'novel-promotion' },
      }
    },
    requireProjectAuthLight: async (projectId: string) => {
      if (!authState.authenticated) return unauthorized()
      return {
        session: { user: { id: 'user-1' } },
        project: { id: projectId, userId: 'user-1', mode: 'novel-promotion' },
      }
    },
  }
})

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/cos', () => ({
  getSignedUrl: vi.fn((key: string) => `https://signed.example/${key}`),
}))

function toModuleImportPath(routeFile: string): string {
  return `@/${routeFile.replace(/^src\//, '').replace(/\.ts$/, '')}`
}

function resolveParamValue(paramName: string): string {
  const key = paramName.toLowerCase()
  if (key.includes('project')) return 'project-1'
  if (key.includes('character')) return 'character-1'
  if (key.includes('location')) return 'location-1'
  if (key.includes('appearance')) return '0'
  if (key.includes('episode')) return 'episode-1'
  if (key.includes('storyboard')) return 'storyboard-1'
  if (key.includes('panel')) return 'panel-1'
  if (key.includes('clip')) return 'clip-1'
  if (key.includes('folder')) return 'folder-1'
  if (key === 'id') return 'id-1'
  return `${paramName}-1`
}

function toApiPath(routeFile: string): { path: string; params: Record<string, string> } {
  const withoutPrefix = routeFile
    .replace(/^src\/app/, '')
    .replace(/\/route\.ts$/, '')

  const params: Record<string, string> = {}
  const path = withoutPrefix.replace(/\[([^\]]+)\]/g, (_full, paramName: string) => {
    const value = resolveParamValue(paramName)
    params[paramName] = value
    return value
  })
  return { path, params }
}

function buildGenericBody() {
  return {
    id: 'id-1',
    name: 'Name',
    type: 'character',
    userInstruction: 'instruction',
    characterId: 'character-1',
    locationId: 'location-1',
    appearanceId: 'appearance-1',
    modifyPrompt: 'modify prompt',
    storyboardId: 'storyboard-1',
    panelId: 'panel-1',
    panelIndex: 0,
    episodeId: 'episode-1',
    content: 'x'.repeat(140),
    voicePrompt: 'voice prompt',
    previewText: 'preview text',
    referenceImageUrl: 'https://example.com/ref.png',
    referenceImageUrls: ['https://example.com/ref.png'],
    lineId: 'line-1',
    audioModel: 'fal::audio-model',
    videoModel: 'fal::video-model',
    insertAfterPanelId: 'panel-1',
    sourcePanelId: 'panel-2',
    variant: { video_prompt: 'variant prompt' },
    currentDescription: 'description',
    modifyInstruction: 'instruction',
    currentPrompt: 'prompt',
    all: false,
  }
}

async function invokeRouteMethod(
  routeFile: string,
  method: RouteMethod,
): Promise<Response> {
  const { path, params } = toApiPath(routeFile)
  const modulePath = toModuleImportPath(routeFile)
  const mod = await import(modulePath)
  const handler = mod[method] as ((req: Request, ctx?: RouteContext) => Promise<Response>) | undefined
  if (!handler) {
    throw new Error(`Route ${routeFile} missing method ${method}`)
  }
  const req = buildMockRequest({
    path,
    method,
    ...(method === 'GET' || method === 'DELETE' ? {} : { body: buildGenericBody() }),
  })
  return await handler(req, { params: Promise.resolve(params) })
}

describe('api contract - crud routes (behavior)', () => {
  const routes = ROUTE_CATALOG.filter(
    (entry) => entry.contractGroup === 'crud-asset-hub-routes' || entry.contractGroup === 'crud-novel-promotion-routes',
  )

  beforeEach(() => {
    vi.clearAllMocks()
    authState.authenticated = false

    prismaMock.globalCharacter.findUnique.mockResolvedValue({
      id: 'character-1',
      userId: 'user-1',
    })
    prismaMock.globalAssetFolder.findUnique.mockResolvedValue({
      id: 'folder-1',
      userId: 'user-1',
    })
    prismaMock.globalCharacter.update.mockResolvedValue({
      id: 'character-1',
      name: 'Alice',
      userId: 'user-1',
      appearances: [],
    })
    prismaMock.globalCharacter.delete.mockResolvedValue({ id: 'character-1' })
    prismaMock.characterAppearance.findUnique.mockResolvedValue({
      id: 'appearance-1',
      characterId: 'character-1',
      imageUrls: JSON.stringify(['cos/char-0.png', 'cos/char-1.png']),
      imageUrl: null,
      selectedIndex: null,
      character: { id: 'character-1', name: 'Alice' },
    })
    prismaMock.characterAppearance.update.mockResolvedValue({
      id: 'appearance-1',
      selectedIndex: 1,
      imageUrl: 'cos/char-1.png',
    })
    prismaMock.novelPromotionLocation.findUnique.mockResolvedValue({
      id: 'location-1',
      name: 'Old Town',
      images: [
        { id: 'img-0', imageIndex: 0, imageUrl: 'cos/loc-0.png' },
        { id: 'img-1', imageIndex: 1, imageUrl: 'cos/loc-1.png' },
      ],
    })
    prismaMock.locationImage.updateMany.mockResolvedValue({ count: 2 })
    prismaMock.locationImage.update.mockResolvedValue({
      id: 'img-1',
      imageIndex: 1,
      imageUrl: 'cos/loc-1.png',
      isSelected: true,
    })
    prismaMock.novelPromotionLocation.update.mockResolvedValue({
      id: 'location-1',
      selectedImageId: 'img-1',
    })
    prismaMock.novelPromotionClip.update.mockResolvedValue({
      id: 'clip-1',
      characters: JSON.stringify(['Alice']),
      location: 'Old Town',
      content: 'clip content',
      screenplay: JSON.stringify({ scenes: [{ id: 1 }] }),
    })
  })

  it('crud route group exists', () => {
    expect(routes.length).toBeGreaterThan(0)
  })

  it('all crud route methods reject unauthenticated requests (no 2xx pass-through)', async () => {
    const methods: ReadonlyArray<RouteMethod> = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']
    let checkedMethodCount = 0

    for (const entry of routes) {
      const modulePath = toModuleImportPath(entry.routeFile)
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

  it('POST /novel-promotion/[projectId]/select-character-image writes selectedIndex and imageUrl key', async () => {
    authState.authenticated = true
    const mod = await import('@/app/api/novel-promotion/[projectId]/select-character-image/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/select-character-image',
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

    const payload = await res.json() as { success: boolean; selectedIndex: number; imageUrl: string }
    expect(payload).toEqual({
      success: true,
      selectedIndex: 1,
      imageUrl: 'https://signed.example/cos/char-1.png',
    })
  })

  it('POST /novel-promotion/[projectId]/select-location-image toggles selected state and selectedImageId', async () => {
    authState.authenticated = true
    const mod = await import('@/app/api/novel-promotion/[projectId]/select-location-image/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/select-location-image',
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
    expect(prismaMock.novelPromotionLocation.update).toHaveBeenCalledWith({
      where: { id: 'location-1' },
      data: { selectedImageId: 'img-1' },
    })
  })

  it('PATCH /novel-promotion/[projectId]/clips/[clipId] writes provided editable fields', async () => {
    authState.authenticated = true
    const mod = await import('@/app/api/novel-promotion/[projectId]/clips/[clipId]/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/clips/clip-1',
      method: 'PATCH',
      body: {
        characters: JSON.stringify(['Alice']),
        location: 'Old Town',
        content: 'clip content',
        screenplay: JSON.stringify({ scenes: [{ id: 1 }] }),
      },
    })

    const res = await mod.PATCH(req, {
      params: Promise.resolve({ projectId: 'project-1', clipId: 'clip-1' }),
    })
    expect(res.status).toBe(200)
    expect(prismaMock.novelPromotionClip.update).toHaveBeenCalledWith({
      where: { id: 'clip-1' },
      data: {
        characters: JSON.stringify(['Alice']),
        location: 'Old Town',
        content: 'clip content',
        screenplay: JSON.stringify({ scenes: [{ id: 1 }] }),
      },
    })
  })
})
