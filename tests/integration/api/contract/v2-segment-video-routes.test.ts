import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import { TASK_TYPE } from '@/lib/task/types'

const submitTaskMock = vi.hoisted(() => vi.fn())
const segmentFindFirstMock = vi.hoisted(() => vi.fn())
const segmentVideoUpsertMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-auth', () => ({
  isErrorResponse: (value: unknown) => value instanceof Response,
  requireProjectAuthLight: async (projectId: string) => ({
    session: { user: { id: 'user-1' } },
    project: { id: projectId, userId: 'user-1', videoModel: 'kling-v1' },
  }),
}))

vi.mock('@/lib/task/submitter', () => ({
  submitTask: submitTaskMock,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    segment: {
      findFirst: segmentFindFirstMock,
    },
    segmentVideo: {
      upsert: segmentVideoUpsertMock,
    },
  },
}))

describe('api contract - v2 segment video routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    submitTaskMock.mockReset()
    segmentFindFirstMock.mockReset()
    segmentVideoUpsertMock.mockReset()

    submitTaskMock.mockResolvedValue({
      success: true,
      async: true,
      taskId: 'task-1',
      runId: 'run-1',
      status: 'queued',
      deduped: false,
    })
  })

  it('POST /api/v2/projects/[projectId]/segments/[segmentId]/video 提交视频生成任务', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/segments/[segmentId]/video/route')
    segmentFindFirstMock.mockResolvedValueOnce({
      id: 'segment-1',
      episodeId: 'episode-1',
      segmentVideo: null,
    })

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/segments/segment-1/video',
      method: 'POST',
      body: {
        mode: 'generate',
        prompt: '镜头快速推进',
      },
    })

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1', segmentId: 'segment-1' }) })
    expect(res.status).toBe(202)

    const payload = await res.json() as { ok: boolean; mode: string; task: { type: string } }
    expect(payload.ok).toBe(true)
    expect(payload.mode).toBe('generate')
    expect(payload.task.type).toBe(TASK_TYPE.VIDEO_PANEL)
    expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      type: TASK_TYPE.VIDEO_PANEL,
      targetType: 'segment',
      targetId: 'segment-1',
      payload: expect.objectContaining({
        videoModel: 'kling-v1',
        videoAssetSchema: expect.objectContaining({
          schema: 'segment_video_asset',
          version: 'v2',
        }),
        versioning: expect.objectContaining({
          compareWithLatest: true,
          compareWithTaskId: null,
        }),
      }),
    }))
  })

  it('POST /api/v2/projects/[projectId]/segments/[segmentId]/video upload 模式会回写视频地址', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/segments/[segmentId]/video/route')
    segmentFindFirstMock.mockResolvedValueOnce({
      id: 'segment-1',
      episodeId: 'episode-1',
      segmentVideo: {
        id: 'sv-1',
        videoUrl: 'https://cdn.example.com/old.mp4',
      },
    })

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/segments/segment-1/video',
      method: 'POST',
      body: {
        mode: 'upload',
        uploadUrl: 'https://cdn.example.com/new.mp4',
      },
    })

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1', segmentId: 'segment-1' }) })
    expect(res.status).toBe(200)

    const payload = await res.json() as { ok: boolean; mode: string; saved: boolean; videoUrl: string }
    expect(payload).toEqual({
      ok: true,
      mode: 'upload',
      segmentId: 'segment-1',
      saved: true,
      videoUrl: 'https://cdn.example.com/new.mp4',
    })
    expect(segmentVideoUpsertMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { segmentId: 'segment-1' },
      update: expect.objectContaining({
        videoUrl: 'https://cdn.example.com/new.mp4',
      }),
    }))
    expect(submitTaskMock).not.toHaveBeenCalled()
  })

  it('GET /api/v2/projects/[projectId]/segments/[segmentId]/video/download 返回下载信息', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/segments/[segmentId]/video/download/route')
    segmentFindFirstMock.mockResolvedValueOnce({
      id: 'segment-1',
      segmentIndex: 2,
      segmentVideo: {
        videoUrl: 'https://cdn.example.com/seg-3.mp4',
        status: 'completed',
        modelKey: 'kling-v1',
        updatedAt: '2026-03-05T00:00:00.000Z',
      },
    })

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/segments/segment-1/video/download',
      method: 'GET',
    })

    const res = await route.GET(req, { params: Promise.resolve({ projectId: 'project-1', segmentId: 'segment-1' }) })
    expect(res.status).toBe(200)

    const payload = await res.json() as {
      ok: boolean
      download: { fileName: string; videoUrl: string; status: string; modelKey: string | null }
    }
    expect(payload.ok).toBe(true)
    expect(payload.download.fileName).toBe('segment-3.mp4')
    expect(payload.download.videoUrl).toBe('https://cdn.example.com/seg-3.mp4')
    expect(payload.download.status).toBe('completed')
    expect(payload.download.modelKey).toBe('kling-v1')
  })

  it('GET /api/v2/projects/[projectId]/segments/[segmentId]/video/download 无视频时返回 404', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/segments/[segmentId]/video/download/route')
    segmentFindFirstMock.mockResolvedValueOnce({
      id: 'segment-1',
      segmentIndex: 0,
      segmentVideo: {
        videoUrl: null,
        status: 'pending',
        modelKey: null,
        updatedAt: null,
      },
    })

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/segments/segment-1/video/download',
      method: 'GET',
    })

    const res = await route.GET(req, { params: Promise.resolve({ projectId: 'project-1', segmentId: 'segment-1' }) })
    expect(res.status).toBe(404)

    const payload = await res.json() as { code: string; message: string }
    expect(payload.code).toBe('NOT_FOUND')
    expect(payload.message).toContain('片段视频不存在')
  })
})
