import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authState = vi.hoisted(() => ({
  authenticated: true,
  projectAuthMode: 'allow' as 'allow' | 'forbidden',
}))

const canvasLayoutServiceMock = vi.hoisted(() => ({
  getProjectCanvasLayout: vi.fn(),
  upsertProjectCanvasLayout: vi.fn(),
  resetProjectCanvasLayout: vi.fn(),
  CanvasLayoutEpisodeMismatchError: class CanvasLayoutEpisodeMismatchError extends Error {},
}))

vi.mock('@/lib/api-auth', () => {
  const unauthorized = () => new Response(
    JSON.stringify({ error: { code: 'UNAUTHORIZED' } }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  )
  const forbidden = () => new Response(
    JSON.stringify({ error: { code: 'FORBIDDEN' } }),
    { status: 403, headers: { 'content-type': 'application/json' } },
  )

  return {
    isErrorResponse: (value: unknown) => value instanceof Response,
    requireProjectAuthLight: async (projectId: string) => {
      if (!authState.authenticated) return unauthorized()
      if (authState.projectAuthMode === 'forbidden') return forbidden()
      return {
        session: { user: { id: 'user-1' } },
        project: { id: projectId, userId: 'user-1', name: 'project' },
      }
    },
  }
})

vi.mock('@/lib/project-canvas/layout/canvas-layout-service', () => canvasLayoutServiceMock)

describe('api contract - project canvas layout route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.authenticated = true
    authState.projectAuthMode = 'allow'
  })

  it('GET returns saved layout for an episode', async () => {
    const snapshot = {
      projectId: 'project-1',
      episodeId: 'episode-1',
      schemaVersion: 1,
      viewport: { x: 10, y: 20, zoom: 1 },
      nodeLayouts: [],
    }
    canvasLayoutServiceMock.getProjectCanvasLayout.mockResolvedValueOnce(snapshot)
    const { GET } = await import('@/app/api/projects/[projectId]/canvas-layout/route')

    const res = await GET(buildMockRequest({
      path: '/api/projects/project-1/canvas-layout',
      method: 'GET',
      query: { episodeId: 'episode-1' },
    }), {
      params: Promise.resolve({ projectId: 'project-1' }),
    })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      success: true,
      layout: snapshot,
    })
    expect(canvasLayoutServiceMock.getProjectCanvasLayout).toHaveBeenCalledWith({
      projectId: 'project-1',
      episodeId: 'episode-1',
    })
  })

  it('PATCH validates and persists canvas layout payload', async () => {
    const snapshot = {
      projectId: 'project-1',
      episodeId: 'episode-1',
      schemaVersion: 1,
      viewport: { x: 12, y: 24, zoom: 0.8 },
      nodeLayouts: [{
        nodeKey: 'image:panel-1',
        nodeType: 'imageAsset',
        targetType: 'panel',
        targetId: 'panel-1',
        x: 100,
        y: 200,
        width: 320,
        height: 220,
        zIndex: 1,
        locked: false,
        collapsed: false,
      }],
    }
    canvasLayoutServiceMock.upsertProjectCanvasLayout.mockResolvedValueOnce(snapshot)
    const { PATCH } = await import('@/app/api/projects/[projectId]/canvas-layout/route')

    const res = await PATCH(buildMockRequest({
      path: '/api/projects/project-1/canvas-layout',
      method: 'PATCH',
      body: {
        episodeId: 'episode-1',
        viewport: { x: 12, y: 24, zoom: 0.8 },
        nodeLayouts: snapshot.nodeLayouts,
      },
    }), {
      params: Promise.resolve({ projectId: 'project-1' }),
    })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      success: true,
      layout: snapshot,
    })
    expect(canvasLayoutServiceMock.upsertProjectCanvasLayout).toHaveBeenCalledWith({
      projectId: 'project-1',
      input: {
        episodeId: 'episode-1',
        viewport: { x: 12, y: 24, zoom: 0.8 },
        nodeLayouts: snapshot.nodeLayouts,
      },
    })
  })

  it('PATCH rejects invalid node payload without calling persistence', async () => {
    const { PATCH } = await import('@/app/api/projects/[projectId]/canvas-layout/route')

    const res = await PATCH(buildMockRequest({
      path: '/api/projects/project-1/canvas-layout',
      method: 'PATCH',
      body: {
        episodeId: 'episode-1',
        viewport: { x: 0, y: 0, zoom: 1 },
        nodeLayouts: [{
          nodeKey: 'bad-node',
          nodeType: 'unknown',
          targetType: 'panel',
          targetId: 'panel-1',
          x: 0,
          y: 0,
          width: 320,
          height: 220,
          zIndex: 0,
          locked: false,
          collapsed: false,
        }],
      },
    }), {
      params: Promise.resolve({ projectId: 'project-1' }),
    })

    expect(res.status).toBe(400)
    expect(canvasLayoutServiceMock.upsertProjectCanvasLayout).not.toHaveBeenCalled()
    const payload = await res.json() as { error: { code: string } }
    expect(payload.error.code).toBe('INVALID_PARAMS')
  })

  it('DELETE resets saved layout for an episode without returning fabricated layout data', async () => {
    canvasLayoutServiceMock.resetProjectCanvasLayout.mockResolvedValueOnce(undefined)
    const { DELETE } = await import('@/app/api/projects/[projectId]/canvas-layout/route')

    const res = await DELETE(buildMockRequest({
      path: '/api/projects/project-1/canvas-layout',
      method: 'DELETE',
      query: { episodeId: 'episode-1' },
    }), {
      params: Promise.resolve({ projectId: 'project-1' }),
    })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      success: true,
    })
    expect(canvasLayoutServiceMock.resetProjectCanvasLayout).toHaveBeenCalledWith({
      projectId: 'project-1',
      episodeId: 'episode-1',
    })
  })

  it('returns auth error before reading layout', async () => {
    authState.authenticated = false
    const { GET } = await import('@/app/api/projects/[projectId]/canvas-layout/route')

    const res = await GET(buildMockRequest({
      path: '/api/projects/project-1/canvas-layout',
      method: 'GET',
      query: { episodeId: 'episode-1' },
    }), {
      params: Promise.resolve({ projectId: 'project-1' }),
    })

    expect(res.status).toBe(401)
    expect(canvasLayoutServiceMock.getProjectCanvasLayout).not.toHaveBeenCalled()
  })
})
