import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const timelineProjectFindUniqueMock = vi.hoisted(() => vi.fn())
const timelineProjectUpdateMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-auth', () => ({
  isErrorResponse: (value: unknown) => value instanceof Response,
  requireProjectAuthLight: async (projectId: string) => ({
    session: { user: { id: 'user-1' } },
    project: { id: projectId, userId: 'user-1' },
  }),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    timelineProject: {
      findUnique: timelineProjectFindUniqueMock,
      update: timelineProjectUpdateMock,
    },
  },
}))

describe('api contract - v2 timeline export route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    timelineProjectFindUniqueMock.mockReset()
    timelineProjectUpdateMock.mockReset()
  })

  it('POST /api/v2/projects/[projectId]/timeline/export 可触发导出并返回完成状态', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/timeline/export/route')
    timelineProjectFindUniqueMock.mockResolvedValueOnce({
      id: 'timeline-1',
      projectData: {
        timeline: [
          { src: 'https://cdn.example.com/clip-1.mp4' },
        ],
      },
      outputUrl: null,
    })
    timelineProjectUpdateMock.mockResolvedValueOnce({
      id: 'timeline-1',
      renderStatus: 'completed',
      outputUrl: 'https://cdn.example.com/clip-1.mp4',
      updatedAt: '2026-03-05T00:00:00.000Z',
    })

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/timeline/export',
      method: 'POST',
      body: {
        editorProjectId: 'editor-1',
        format: 'mp4',
        quality: 'high',
      },
    })

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)

    const payload = await res.json() as {
      ok: boolean
      exportSchema: { schema: string; version: string; strategy: string }
      render: { id: string; status: string; outputUrl: string; strategy: string }
    }
    expect(payload.ok).toBe(true)
    expect(payload.exportSchema).toEqual({
      schema: 'timeline_export',
      version: 'v2',
      strategy: 'mvp_passthrough_first_clip',
    })
    expect(payload.render.id).toBe('timeline-1')
    expect(payload.render.status).toBe('completed')
    expect(payload.render.outputUrl).toBe('https://cdn.example.com/clip-1.mp4')
    expect(payload.render.strategy).toBe('mvp_passthrough_first_clip')
  })

  it('GET /api/v2/projects/[projectId]/timeline/export 可查询导出状态', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/timeline/export/route')
    timelineProjectFindUniqueMock.mockResolvedValueOnce({
      id: 'timeline-1',
      renderStatus: 'completed',
      outputUrl: 'https://cdn.example.com/final.mp4',
      updatedAt: '2026-03-05T00:00:00.000Z',
    })

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/timeline/export?id=timeline-1',
      method: 'GET',
    })

    const res = await route.GET(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)

    const payload = await res.json() as {
      ok: boolean
      exportSchema: { schema: string; version: string; strategy: string }
      render: { id: string; status: string; outputUrl: string }
    }
    expect(payload.ok).toBe(true)
    expect(payload.exportSchema.schema).toBe('timeline_export')
    expect(payload.exportSchema.version).toBe('v2')
    expect(payload.render.id).toBe('timeline-1')
    expect(payload.render.status).toBe('completed')
    expect(payload.render.outputUrl).toBe('https://cdn.example.com/final.mp4')
  })

  it('GET /api/v2/projects/[projectId]/timeline/export 缺失 id 返回 400', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/timeline/export/route')

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/timeline/export',
      method: 'GET',
    })

    const res = await route.GET(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(400)

    const payload = await res.json() as { code: string; message: string }
    expect(payload.code).toBe('INVALID_PARAMS')
    expect(payload.message).toContain('id')
  })
})
