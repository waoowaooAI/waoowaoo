import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import { TASK_TYPE } from '@/lib/task/types'

const submitTaskMock = vi.hoisted(() => vi.fn())
const segmentFindFirstMock = vi.hoisted(() => vi.fn())
const episodeFindFirstMock = vi.hoisted(() => vi.fn())
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
    segment: {
      findFirst: segmentFindFirstMock,
    },
    episode: {
      findFirst: episodeFindFirstMock,
    },
    storyboardEntry: {
      findUnique: storyboardEntryFindUniqueMock,
      update: storyboardEntryUpdateMock,
    },
  },
}))

describe('api contract - v2 storyboard routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    submitTaskMock.mockReset()
    segmentFindFirstMock.mockReset()
    episodeFindFirstMock.mockReset()
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
  })

  it('POST /api/v2/projects/[projectId]/storyboards/generate 可按 segment 提交分镜生成任务', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/storyboards/generate/route')
    segmentFindFirstMock.mockResolvedValueOnce({
      id: 'segment-1',
      episodeId: 'episode-1',
    })

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/storyboards/generate',
      method: 'POST',
      body: {
        segmentId: 'segment-1',
        mode: 'generate',
      },
    })

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(202)

    const payload = await res.json() as {
      ok: boolean
      targetType: string
      targetId: string
      task: { type: string; id: string }
    }
    expect(payload.ok).toBe(true)
    expect(payload.targetType).toBe('segment')
    expect(payload.targetId).toBe('segment-1')
    expect(payload.task.type).toBe(TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN)
    expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      type: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
      targetType: 'segment',
      targetId: 'segment-1',
      episodeId: 'episode-1',
    }))
    const submitArg = submitTaskMock.mock.calls[0]?.[0] as {
      dedupeKey?: string | null
      payload?: {
        storyboardPanelSchema?: {
          schema?: string
          version?: string
          fields?: string[]
        }
        versioning?: {
          compareWithLatest?: boolean
          compareWithTaskId?: string | null
        }
      }
    }
    expect(submitArg.dedupeKey).toBe(`${TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN}:segment:segment-1`)
    expect(submitArg.payload?.storyboardPanelSchema?.schema).toBe('storyboard_panel')
    expect(submitArg.payload?.storyboardPanelSchema?.version).toBe('v2')
    expect(submitArg.payload?.storyboardPanelSchema?.fields).toContain('dialogueTone')
    expect(submitArg.payload?.versioning?.compareWithLatest).toBe(true)
    expect(submitArg.payload?.versioning?.compareWithTaskId).toBeNull()
  })

  it('POST /api/v2/projects/[projectId]/storyboards/generate 缺失 episodeId/segmentId 时返回 400', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/storyboards/generate/route')

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/storyboards/generate',
      method: 'POST',
      body: {},
    })

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(400)

    const payload = await res.json() as { code: string; message: string }
    expect(payload.code).toBe('INVALID_PARAMS')
    expect(payload.message).toContain('至少需要提供一个')
  })

  it('PATCH /api/v2/projects/[projectId]/storyboards/entries/[entryId] 可更新秒级区间和台词字段', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/storyboards/entries/[entryId]/route')
    storyboardEntryFindUniqueMock.mockResolvedValueOnce({
      id: 'entry-1',
      startTime: 0,
      endTime: 5,
      segment: {
        episode: {
          projectId: 'project-1',
        },
      },
    })
    storyboardEntryUpdateMock.mockResolvedValueOnce({
      id: 'entry-1',
      segmentId: 'segment-1',
      entryIndex: 1,
      startTime: 5,
      endTime: 10,
      description: '动作描述',
      dialogue: '台词内容',
      dialogueSpeaker: '张三',
      dialogueTone: '低沉',
      soundEffect: '剑鸣',
      shotType: 'close-up',
      cameraMove: 'push-in',
      imagePrompt: 'cinematic frame',
      photographyNotes: '注意反打镜头',
      actingNotes: '眼神压迫',
      characterRefs: ['张三'],
      updatedAt: '2026-03-05T00:00:00.000Z',
    })

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/storyboards/entries/entry-1',
      method: 'PATCH',
      body: {
        startSec: 5,
        endSec: 10,
        dialogue: '台词内容',
        dialogueTone: '低沉',
        soundEffect: '剑鸣',
      },
    })

    const res = await route.PATCH(req, { params: Promise.resolve({ projectId: 'project-1', entryId: 'entry-1' }) })
    expect(res.status).toBe(200)

    const payload = await res.json() as { ok: boolean; entry: { startSec: number; endSec: number; dialogue: string } }
    expect(payload.ok).toBe(true)
    expect(payload.entry.startSec).toBe(5)
    expect(payload.entry.endSec).toBe(10)
    expect(payload.entry.dialogue).toBe('台词内容')
    expect(storyboardEntryUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        startTime: 5,
        endTime: 10,
        dialogue: '台词内容',
        dialogueTone: '低沉',
        soundEffect: '剑鸣',
      }),
    }))
  })

  it('PATCH /api/v2/projects/[projectId]/storyboards/entries/[entryId] 秒级区间非法时返回 400', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/storyboards/entries/[entryId]/route')

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/storyboards/entries/entry-1',
      method: 'PATCH',
      body: {
        startSec: 10,
        endSec: 8,
      },
    })

    const res = await route.PATCH(req, { params: Promise.resolve({ projectId: 'project-1', entryId: 'entry-1' }) })
    expect(res.status).toBe(400)

    const payload = await res.json() as { code: string; message: string }
    expect(payload.code).toBe('INVALID_PARAMS')
    expect(payload.message).toContain('endSec')
  })

  it('POST /api/v2/projects/[projectId]/storyboards/entries/[entryId]/regenerate 可提交局部重生成任务', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/storyboards/entries/[entryId]/regenerate/route')
    storyboardEntryFindUniqueMock.mockResolvedValueOnce({
      id: 'entry-1',
      segmentId: 'segment-1',
      segment: {
        episodeId: 'episode-1',
        episode: {
          projectId: 'project-1',
        },
      },
    })

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/storyboards/entries/entry-1/regenerate',
      method: 'POST',
      body: {
        fields: ['description', 'dialogueTone'],
        promptAppend: '加强冲突感',
      },
    })

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1', entryId: 'entry-1' }) })
    expect(res.status).toBe(202)

    const payload = await res.json() as { ok: boolean; regenerate: { fields: string[] }; task: { type: string } }
    expect(payload.ok).toBe(true)
    expect(payload.regenerate.fields).toEqual(['description', 'dialogueTone'])
    expect(payload.task.type).toBe(TASK_TYPE.REGENERATE_STORYBOARD_TEXT)
    expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      type: TASK_TYPE.REGENERATE_STORYBOARD_TEXT,
      targetType: 'storyboard_entry',
      targetId: 'entry-1',
      payload: expect.objectContaining({
        fields: ['description', 'dialogueTone'],
        storyboardPanelSchema: expect.objectContaining({
          schema: 'storyboard_panel',
          version: 'v2',
        }),
        versioning: expect.objectContaining({
          compareWithLatest: true,
          compareWithTaskId: null,
        }),
      }),
    }))
  })
})
