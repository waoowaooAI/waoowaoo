import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import { TASK_TYPE } from '@/lib/task/types'

const submitTaskMock = vi.hoisted(() => vi.fn())
const projectFindUniqueMock = vi.hoisted(() => vi.fn())
const episodeFindUniqueMock = vi.hoisted(() => vi.fn())

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
    project: {
      findUnique: projectFindUniqueMock,
    },
    episode: {
      findUnique: episodeFindUniqueMock,
    },
  },
}))

describe('api contract - v2 split chain routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    submitTaskMock.mockReset()
    projectFindUniqueMock.mockReset()
    episodeFindUniqueMock.mockReset()

    submitTaskMock.mockResolvedValue({
      success: true,
      async: true,
      taskId: 'task-1',
      runId: 'run-1',
      status: 'queued',
      deduped: false,
    })
  })

  it('POST /api/v2/projects/[projectId]/episodes/split submits EPISODE_SPLIT_LLM task', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/episodes/split/route')
    projectFindUniqueMock.mockResolvedValueOnce({
      id: 'project-1',
      episodeCount: 10,
      segmentDuration: 6,
      episodeDuration: 72,
      totalDuration: 720,
      globalContext: 'ctx',
      novelText: 'novel',
    })

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/episodes/split',
      method: 'POST',
      body: { desiredEpisodeCount: 12, strategy: 'balanced' },
    })
    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(202)

    const payload = await res.json() as { ok: boolean; task: { type: string; id: string } }
    expect(payload.ok).toBe(true)
    expect(payload.task.type).toBe(TASK_TYPE.EPISODE_SPLIT_LLM)
    expect(payload.task.id).toBe('task-1')
    expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      type: TASK_TYPE.EPISODE_SPLIT_LLM,
      projectId: 'project-1',
      targetType: 'project',
      targetId: 'project-1',
    }))
    const submitArg = submitTaskMock.mock.calls[0]?.[0] as {
      dedupeKey?: string | null
      payload?: {
        content?: string
        episodePlanSchema?: {
          schema?: string
          version?: string
          rhythmAnchorFields?: string[]
        }
        versioning?: {
          compareWithLatest?: boolean
          compareWithTaskId?: string | null
        }
      }
    }
    expect(submitArg.dedupeKey).toBe('episode_split_llm:project-1')
    expect(submitArg.payload?.content).toBe('novel')
    expect(submitArg.payload?.episodePlanSchema?.schema).toBe('episode_plan')
    expect(submitArg.payload?.episodePlanSchema?.version).toBe('v2')
    expect(submitArg.payload?.episodePlanSchema?.rhythmAnchorFields).toEqual(['hook', 'twist', 'conflict'])
    expect(submitArg.payload?.versioning?.compareWithLatest).toBe(true)
    expect(submitArg.payload?.versioning?.compareWithTaskId).toBeNull()
  })

  it('POST /api/v2/projects/[projectId]/episodes/split disables dedupe when forceRetry is true', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/episodes/split/route')
    projectFindUniqueMock.mockResolvedValueOnce({
      id: 'project-1',
      episodeCount: 10,
      segmentDuration: 6,
      episodeDuration: 72,
      totalDuration: 720,
      globalContext: 'ctx',
      novelText: 'novel',
    })

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/episodes/split',
      method: 'POST',
      body: {
        desiredEpisodeCount: 12,
        forceRetry: true,
        compareWithTaskId: 'task-prev',
      },
    })
    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(202)

    const submitArg = submitTaskMock.mock.calls[0]?.[0] as {
      dedupeKey?: string | null
      payload?: {
        versioning?: {
          compareWithTaskId?: string | null
        }
      }
    }
    expect(submitArg.dedupeKey).toBeNull()
    expect(submitArg.payload?.versioning?.compareWithTaskId).toBe('task-prev')
  })

  it('POST /api/v2/projects/[projectId]/segments/split validates episode ownership and submits SEGMENT_SPLIT_LLM', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/segments/split/route')
    projectFindUniqueMock.mockResolvedValueOnce({
      id: 'project-1',
      segmentDuration: 6,
      episodeDuration: 72,
      episodeCount: 10,
      globalContext: 'ctx',
      novelText: 'novel',
    })
    episodeFindUniqueMock.mockResolvedValueOnce({
      id: 'episode-1',
      projectId: 'project-1',
      novelText: 'episode novel',
      context: 'episode ctx',
    })

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/segments/split',
      method: 'POST',
      body: { episodeId: 'episode-1', desiredSegmentsPerEpisode: 12 },
    })
    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(202)

    const payload = await res.json() as { ok: boolean; task: { type: string; id: string } }
    expect(payload.ok).toBe(true)
    expect(payload.task.type).toBe(TASK_TYPE.SEGMENT_SPLIT_LLM)
    expect(payload.task.id).toBe('task-1')
    expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      type: TASK_TYPE.SEGMENT_SPLIT_LLM,
      episodeId: 'episode-1',
      targetType: 'episode',
      targetId: 'episode-1',
    }))
    const submitArg = submitTaskMock.mock.calls[0]?.[0] as {
      dedupeKey?: string | null
      payload?: {
        content?: string
        clipPlanSchema?: {
          schema?: string
          version?: string
          fields?: string[]
        }
        versioning?: {
          compareWithLatest?: boolean
        }
      }
    }
    expect(submitArg.dedupeKey).toBe('segment_split_llm:episode-1')
    expect(submitArg.payload?.content).toBe('episode novel')
    expect(submitArg.payload?.clipPlanSchema?.schema).toBe('clip_plan')
    expect(submitArg.payload?.clipPlanSchema?.version).toBe('v2')
    expect(submitArg.payload?.clipPlanSchema?.fields).toContain('splitReason')
    expect(submitArg.payload?.versioning?.compareWithLatest).toBe(true)
  })

  it('POST /api/v2/projects/[projectId]/segments/split requires episodeId', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/segments/split/route')
    projectFindUniqueMock.mockResolvedValueOnce({
      id: 'project-1',
      segmentDuration: 6,
      episodeDuration: 72,
      episodeCount: 10,
      globalContext: 'ctx',
      novelText: 'novel',
    })

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/segments/split',
      method: 'POST',
      body: {},
    })
    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(400)
    const payload = await res.json() as { error?: { code?: string; details?: { message?: string } } }
    expect(payload.error?.code).toBe('INVALID_PARAMS')
    expect(payload.error?.details?.message).toContain('episodeId 不能为空')
    expect(submitTaskMock).not.toHaveBeenCalled()
  })

  it('POST /api/v2/projects/[projectId]/context/build submits ANALYZE_GLOBAL task', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/context/build/route')
    projectFindUniqueMock.mockResolvedValueOnce({
      id: 'project-1',
      description: 'desc',
      globalContext: 'ctx',
      novelText: 'novel',
    })

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/context/build',
      method: 'POST',
      body: { promptAppend: 'append', forceRefresh: true },
    })
    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(202)

    const payload = await res.json() as { ok: boolean; task: { type: string; id: string } }
    expect(payload.ok).toBe(true)
    expect(payload.task.type).toBe(TASK_TYPE.ANALYZE_GLOBAL)
    expect(payload.task.id).toBe('task-1')
    expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      type: TASK_TYPE.ANALYZE_GLOBAL,
      projectId: 'project-1',
      targetType: 'project',
      targetId: 'project-1',
    }))
    const submitArg = submitTaskMock.mock.calls[0]?.[0] as {
      dedupeKey?: string | null
      payload?: {
        globalContextSchema?: {
          schema?: string
          version?: string
          sections?: string[]
        }
        versioning?: {
          compareWithLatest?: boolean
          compareWithTaskId?: string | null
        }
      }
    }
    expect(submitArg.dedupeKey).toBeNull()
    expect(submitArg.payload?.globalContextSchema?.schema).toBe('global_context')
    expect(submitArg.payload?.globalContextSchema?.version).toBe('v2')
    expect(submitArg.payload?.globalContextSchema?.sections).toEqual([
      'worldRules',
      'characterRelations',
      'styleConstraints',
    ])
    expect(submitArg.payload?.versioning?.compareWithLatest).toBe(true)
    expect(submitArg.payload?.versioning?.compareWithTaskId).toBeNull()
  })
})
