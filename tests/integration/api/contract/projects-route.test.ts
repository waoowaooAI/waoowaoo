import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

type AuthState = { authenticated: boolean }

const authState = vi.hoisted<AuthState>(() => ({ authenticated: true }))
const logProjectActionMock = vi.hoisted(() => vi.fn())

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn(async () => ({
      analysisModel: 'llm::analysis',
      characterModel: 'img::character',
      locationModel: 'img::location',
      storyboardModel: 'img::storyboard',
      editModel: 'img::edit',
      videoModel: 'vid::model',
      videoRatio: '9:16',
      artStyle: 'american-comic',
      ttsRate: 1,
    })),
  },
  project: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'project-1',
      ...data,
    })),
  },
  novelPromotionProject: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'np-1', ...data })),
  },
}))

vi.mock('@/lib/api-auth', () => {
  const unauthorized = () => new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED' } }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  })

  return {
    isErrorResponse: (value: unknown) => value instanceof Response,
    requireUserAuth: async () => {
      if (!authState.authenticated) return unauthorized()
      return { session: { user: { id: 'user-1' } } }
    },
  }
})

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/logging/semantic', () => ({ logProjectAction: logProjectActionMock }))

describe('api contract - /api/projects POST projectMode compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.authenticated = true
  })

  it('accepts projectMode=manga and logs manga conversion analytics', async () => {
    const { POST } = await import('@/app/api/projects/route')
    const req = buildMockRequest({
      path: '/api/projects',
      method: 'POST',
      body: {
        name: 'Manga Launch',
        description: 'desc',
        projectMode: 'manga',
      },
    })

    const res = await POST(req)
    expect(res.status).toBe(201)
    expect(prismaMock.project.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: 'Manga Launch',
        description: 'desc',
        mode: 'novel-promotion',
        userId: 'user-1',
      }),
    }))
    expect(logProjectActionMock).toHaveBeenCalledWith(
      'WORKSPACE_MANGA_CONVERSION',
      'workspace manga conversion captured',
      expect.objectContaining({
        event: 'workspace_manga_conversion',
        projectMode: 'manga',
        projectId: 'project-1',
      }),
      'user-1',
    )
  })

  it('keeps backward compatibility when projectMode is omitted without emitting conversion analytics', async () => {
    const { POST } = await import('@/app/api/projects/route')
    const req = buildMockRequest({
      path: '/api/projects',
      method: 'POST',
      body: {
        name: 'Story Launch',
        description: 'desc',
      },
    })

    const res = await POST(req)
    expect(res.status).toBe(201)
    expect(logProjectActionMock).not.toHaveBeenCalled()
  })
})
