import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const timelineProjectFindUniqueMock = vi.hoisted(() => vi.fn())
const timelineProjectUpsertMock = vi.hoisted(() => vi.fn())

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
      upsert: timelineProjectUpsertMock,
    },
  },
}))

describe('api contract - v2 timeline route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    timelineProjectFindUniqueMock.mockReset()
    timelineProjectUpsertMock.mockReset()
  })

  it('PATCH /api/v2/projects/[projectId]/timeline 可保存时间轴项目', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/timeline/route')
    timelineProjectUpsertMock.mockResolvedValueOnce({
      id: 'timeline-1',
      updatedAt: '2026-03-05T00:00:00.000Z',
    })

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/timeline',
      method: 'PATCH',
      body: {
        projectData: {
          id: 'editor-1',
          episodeId: 'episode-1',
          schemaVersion: '1.0',
          config: {
            fps: 30,
            width: 1080,
            height: 1920,
          },
          timeline: [
            {
              id: 'clip-1',
              src: 'https://cdn.example.com/clip-1.mp4',
              durationInFrames: 90,
              metadata: {
                panelId: 'panel-1',
                storyboardId: 'storyboard-1',
              },
            },
          ],
          bgmTrack: [],
        },
      },
    })

    const res = await route.PATCH(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)

    const payload = await res.json() as {
      ok: boolean
      timelineSchema: { schema: string; version: string }
      timeline: { id: string; projectData: { id: string } }
    }
    expect(payload.ok).toBe(true)
    expect(payload.timelineSchema).toEqual({
      schema: 'timeline_project',
      version: 'v2',
      trackModel: 'single_video_track',
    })
    expect(payload.timeline.id).toBe('timeline-1')
    expect(payload.timeline.projectData.id).toBe('editor-1')
    expect(timelineProjectUpsertMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { projectId: 'project-1' },
      update: expect.objectContaining({
        renderStatus: 'draft',
      }),
    }))
  })

  it('PATCH /api/v2/projects/[projectId]/timeline 非法 clip 数据返回 400', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/timeline/route')

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/timeline',
      method: 'PATCH',
      body: {
        projectData: {
          id: 'editor-1',
          episodeId: 'episode-1',
          schemaVersion: '1.0',
          config: {
            fps: 30,
            width: 1080,
            height: 1920,
          },
          timeline: [
            {
              id: 'clip-1',
              durationInFrames: 90,
              metadata: {
                panelId: 'panel-1',
                storyboardId: 'storyboard-1',
              },
            },
          ],
          bgmTrack: [],
        },
      },
    })

    const res = await route.PATCH(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(400)

    const payload = await res.json() as { code: string; message: string }
    expect(payload.code).toBe('INVALID_PARAMS')
    expect(payload.message).toContain('timeline')
  })

  it('GET /api/v2/projects/[projectId]/timeline 返回已保存时间轴', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/timeline/route')
    timelineProjectFindUniqueMock.mockResolvedValueOnce({
      id: 'timeline-1',
      projectData: {
        id: 'editor-1',
      },
      renderStatus: 'draft',
      outputUrl: null,
      updatedAt: '2026-03-05T00:00:00.000Z',
    })

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/timeline',
      method: 'GET',
    })

    const res = await route.GET(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)

    const payload = await res.json() as {
      ok: boolean
      timelineSchema: { schema: string; version: string }
      timeline: { id: string; renderStatus: string; projectData: { id: string } }
    }
    expect(payload.ok).toBe(true)
    expect(payload.timelineSchema.schema).toBe('timeline_project')
    expect(payload.timelineSchema.version).toBe('v2')
    expect(payload.timeline.id).toBe('timeline-1')
    expect(payload.timeline.renderStatus).toBe('draft')
    expect(payload.timeline.projectData.id).toBe('editor-1')
  })
})
