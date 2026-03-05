import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const projectCountMock = vi.hoisted(() => vi.fn())
const projectFindManyMock = vi.hoisted(() => vi.fn())
const usageCostGroupByMock = vi.hoisted(() => vi.fn())
const episodeGroupByMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-auth', () => ({
  isErrorResponse: (value: unknown) => value instanceof Response,
  requireUserAuth: async () => ({ session: { user: { id: 'user-1' } } }),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    project: {
      count: projectCountMock,
      findMany: projectFindManyMock,
    },
    usageCost: {
      groupBy: usageCostGroupByMock,
    },
    episode: {
      groupBy: episodeGroupByMock,
    },
  },
}))

describe('api contract - v2 projects list route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    projectCountMock.mockResolvedValue(2)
    projectFindManyMock.mockResolvedValue([
      {
        id: 'project-1',
        name: '项目 A',
        description: '描述 A',
        createdAt: new Date('2026-03-05T00:00:00.000Z'),
        updatedAt: new Date('2026-03-05T00:10:00.000Z'),
      },
      {
        id: 'project-2',
        name: '项目 B',
        description: null,
        createdAt: new Date('2026-03-05T00:20:00.000Z'),
        updatedAt: new Date('2026-03-05T00:30:00.000Z'),
      },
    ])
    usageCostGroupByMock.mockResolvedValue([
      { projectId: 'project-1', _sum: { cost: 12.34 } },
    ])
    episodeGroupByMock.mockResolvedValue([
      { projectId: 'project-1', _count: { _all: 3 } },
      { projectId: 'project-2', _count: { _all: 0 } },
    ])
  })

  it('GET /api/v2/projects 返回分页列表与统计字段', async () => {
    const { GET } = await import('@/app/api/v2/projects/route')
    const req = buildMockRequest({
      path: '/api/v2/projects',
      method: 'GET',
      query: {
        page: 1,
        pageSize: 7,
      },
    })

    const res = await GET(req)
    expect(res.status).toBe(200)
    const payload = await res.json() as {
      ok: boolean
      projects: Array<{
        id: string
        totalCost: number
        stats: {
          episodes: number
          images: number
          videos: number
          panels: number
          firstEpisodePreview: string | null
        }
      }>
      pagination: {
        page: number
        pageSize: number
        total: number
        totalPages: number
      }
    }

    expect(payload.ok).toBe(true)
    expect(payload.projects).toHaveLength(2)
    expect(payload.projects[0]).toMatchObject({
      id: 'project-1',
      totalCost: 12.34,
      stats: {
        episodes: 3,
        images: 0,
        videos: 0,
        panels: 0,
        firstEpisodePreview: null,
      },
    })
    expect(payload.projects[1]).toMatchObject({
      id: 'project-2',
      totalCost: 0,
      stats: expect.objectContaining({
        episodes: 0,
      }),
    })
    expect(payload.pagination).toEqual({
      page: 1,
      pageSize: 7,
      total: 2,
      totalPages: 1,
    })
  })
})
