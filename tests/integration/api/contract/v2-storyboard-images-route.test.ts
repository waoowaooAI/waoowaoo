import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import { TASK_TYPE } from '@/lib/task/types'

const submitTaskMock = vi.hoisted(() => vi.fn())
const storyboardEntryFindUniqueMock = vi.hoisted(() => vi.fn())
const storyboardEntryUpdateMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-auth', () => ({
  isErrorResponse: (value: unknown) => value instanceof Response,
  requireProjectAuthLight: async (projectId: string) => ({
    session: { user: { id: 'user-1' } },
    project: { id: projectId, userId: 'user-1' },
  }),
}))

vi.mock('@/lib/task/submitter', () => ({
  submitTask: submitTaskMock,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    storyboardEntry: {
      findUnique: storyboardEntryFindUniqueMock,
      update: storyboardEntryUpdateMock,
    },
  },
}))

describe('api contract - v2 storyboard images route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    submitTaskMock.mockReset()
    storyboardEntryFindUniqueMock.mockReset()
    storyboardEntryUpdateMock.mockReset()

    submitTaskMock.mockResolvedValue({
      success: true,
      async: true,
      taskId: 'task-1',
      runId: 'run-1',
      status: 'queued',
      deduped: false,
    })

    storyboardEntryFindUniqueMock.mockResolvedValue({
      id: 'entry-1',
      segmentId: 'segment-1',
      imageUrl: 'https://cdn.example.com/old.png',
      segment: {
        episodeId: 'episode-1',
        episode: {
          projectId: 'project-1',
        },
      },
    })
  })

  it('POST /api/v2/projects/[projectId]/storyboards/entries/[entryId]/images 默认按 9 宫格提交生成任务', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/storyboards/entries/[entryId]/images/route')

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/storyboards/entries/entry-1/images',
      method: 'POST',
      body: {
        mode: 'generate',
        prompt: '高对比镜头感',
      },
    })

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1', entryId: 'entry-1' }) })
    expect(res.status).toBe(202)

    const payload = await res.json() as { ok: boolean; layout: number; task: { type: string } }
    expect(payload.ok).toBe(true)
    expect(payload.layout).toBe(9)
    expect(payload.task.type).toBe(TASK_TYPE.IMAGE_PANEL)
    expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      type: TASK_TYPE.IMAGE_PANEL,
      targetType: 'storyboard_entry',
      targetId: 'entry-1',
      payload: expect.objectContaining({
        layout: 9,
        storyboardImageSchema: expect.objectContaining({
          schema: 'storyboard_image',
          version: 'v2',
          defaultLayout: 9,
        }),
        versioning: expect.objectContaining({
          compareWithLatest: true,
          compareWithTaskId: null,
        }),
      }),
    }))
  })

  it('POST /api/v2/projects/[projectId]/storyboards/entries/[entryId]/images 的 upload 模式会回写图片', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/storyboards/entries/[entryId]/images/route')

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/storyboards/entries/entry-1/images',
      method: 'POST',
      body: {
        mode: 'upload',
        uploadUrl: 'https://cdn.example.com/new.png',
      },
    })

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1', entryId: 'entry-1' }) })
    expect(res.status).toBe(200)

    const payload = await res.json() as { ok: boolean; mode: string; saved: boolean; layout: number }
    expect(payload).toEqual({
      ok: true,
      mode: 'upload',
      saved: true,
      layout: 9,
    })
    expect(storyboardEntryUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        imageUrl: 'https://cdn.example.com/new.png',
      }),
    }))
    expect(submitTaskMock).not.toHaveBeenCalled()
  })

  it('POST /api/v2/projects/[projectId]/storyboards/entries/[entryId]/images 的 regenerate 模式提交修改任务', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/storyboards/entries/[entryId]/images/route')

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/storyboards/entries/entry-1/images',
      method: 'POST',
      body: {
        mode: 'regenerate',
        layout: 16,
      },
    })

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1', entryId: 'entry-1' }) })
    expect(res.status).toBe(202)

    const payload = await res.json() as { ok: boolean; mode: string; layout: number; task: { type: string } }
    expect(payload.ok).toBe(true)
    expect(payload.mode).toBe('regenerate')
    expect(payload.layout).toBe(16)
    expect(payload.task.type).toBe(TASK_TYPE.MODIFY_ASSET_IMAGE)
    expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      type: TASK_TYPE.MODIFY_ASSET_IMAGE,
      payload: expect.objectContaining({
        mode: 'regenerate',
        layout: 16,
        storyboardImageSchema: expect.objectContaining({
          schema: 'storyboard_image',
          version: 'v2',
        }),
      }),
    }))
  })

  it('POST /api/v2/projects/[projectId]/storyboards/entries/[entryId]/images 的 upload 缺失 uploadUrl 返回 400', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/storyboards/entries/[entryId]/images/route')

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/storyboards/entries/entry-1/images',
      method: 'POST',
      body: {
        mode: 'upload',
      },
    })

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1', entryId: 'entry-1' }) })
    expect(res.status).toBe(400)

    const payload = await res.json() as { code: string; message: string }
    expect(payload.code).toBe('INVALID_PARAMS')
    expect(payload.message).toContain('uploadUrl')
  })
})
