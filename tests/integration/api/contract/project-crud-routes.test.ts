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

describe('api contract - project crud routes (behavior)', () => {
  const projectRoutes = crudRoutes.filter((entry) =>
    entry.routeFile.includes('/projects/[projectId]/clips/')
    || entry.routeFile.includes('/projects/[projectId]/panel/')
    || entry.routeFile.includes('/projects/[projectId]/storyboards/'),
  )

  beforeEach(() => {
    resetCrudMocks()
  })

  it('all project crud route methods reject unauthenticated requests (no 2xx pass-through)', async () => {
    const methods: ReadonlyArray<RouteMethod> = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']
    let checkedMethodCount = 0

    for (const entry of projectRoutes) {
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

  it('PATCH /projects/[projectId]/clips/[clipId] writes provided editable fields', async () => {
    authState.authenticated = true
    const mod = await import('@/app/api/projects/[projectId]/clips/[clipId]/route')
    const req = buildMockRequest({
      path: '/api/projects/project-1/clips/clip-1',
      method: 'PATCH',
      body: {
        characters: JSON.stringify(['Alice']),
        location: 'Old Town',
        props: JSON.stringify(['Bronze Dagger']),
        content: 'clip content',
        screenplay: JSON.stringify({ scenes: [{ id: 1 }] }),
      },
    })

    const res = await mod.PATCH(req, {
      params: Promise.resolve({ projectId: 'project-1', clipId: 'clip-1' }),
    })
    expect(res.status).toBe(200)
    expect(prismaMock.projectClip.update).toHaveBeenCalledWith({
      where: { id: 'clip-1' },
      data: {
        characters: JSON.stringify(['Alice']),
        location: 'Old Town',
        props: JSON.stringify(['Bronze Dagger']),
        content: 'clip content',
        screenplay: JSON.stringify({ scenes: [{ id: 1 }] }),
      },
    })
  })

  it('PUT /projects/[projectId]/panel writes provided props to prisma.projectPanel.update', async () => {
    authState.authenticated = true
    const mod = await import('@/app/api/projects/[projectId]/panel/route')
    const req = buildMockRequest({
      path: '/api/projects/project-1/panel',
      method: 'PUT',
      body: {
        storyboardId: 'storyboard-1',
        panelIndex: 0,
        location: 'Old Town',
        characters: JSON.stringify(['Alice']),
        props: JSON.stringify(['Bronze Dagger']),
        description: 'panel description',
      },
    })

    const res = await mod.PUT(req, {
      params: Promise.resolve({ projectId: 'project-1' }),
    })

    expect(res.status).toBe(200)
    expect(prismaMock.projectPanel.update).toHaveBeenCalledWith({
      where: { id: 'panel-1' },
      data: {
        location: 'Old Town',
        characters: JSON.stringify(['Alice']),
        props: JSON.stringify(['Bronze Dagger']),
        description: 'panel description',
      },
    })
  })
})
