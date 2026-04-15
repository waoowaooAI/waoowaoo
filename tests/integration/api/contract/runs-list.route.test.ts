import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authState = vi.hoisted(() => ({ authenticated: true }))
const listRunsMock = vi.hoisted(() => vi.fn())
const createRunMock = vi.hoisted(() => vi.fn())

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

vi.mock('@/lib/run-runtime/service', () => ({
  listRuns: listRunsMock,
  createRun: createRunMock,
}))

describe('api contract - runs list route', () => {
  const emptyRouteContext = {
    params: Promise.resolve({}),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    authState.authenticated = true
    listRunsMock.mockResolvedValue([
      {
        id: 'run-1',
        status: 'running',
      },
    ])
  })

  it('tightens scoped active run queries to the latest recoverable run', async () => {
    const { GET } = await import('@/app/api/runs/route')

    const req = buildMockRequest({
      path: '/api/runs?projectId=project-1&workflowType=story_to_script_run&targetType=ProjectEpisode&targetId=episode-1&episodeId=episode-1&status=queued&status=running&status=canceling&limit=20',
      method: 'GET',
    })
    const res = await GET(req, emptyRouteContext)

    expect(res.status).toBe(200)
    expect(listRunsMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      projectId: 'project-1',
      workflowType: 'story_to_script_run',
      targetType: 'ProjectEpisode',
      targetId: 'episode-1',
      episodeId: 'episode-1',
      statuses: ['queued', 'running', 'canceling'],
      limit: 20,
      recoverableOnly: true,
      latestOnly: true,
    }))
  })

  it('keeps non-active queries as normal list requests', async () => {
    const { GET } = await import('@/app/api/runs/route')

    const req = buildMockRequest({
      path: '/api/runs?projectId=project-1&workflowType=story_to_script_run&targetType=ProjectEpisode&targetId=episode-1&status=completed&limit=20',
      method: 'GET',
    })
    const res = await GET(req, emptyRouteContext)

    expect(res.status).toBe(200)
    expect(listRunsMock).toHaveBeenCalledWith(expect.objectContaining({
      statuses: ['completed'],
      recoverableOnly: false,
      latestOnly: false,
    }))
  })
})
