import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import { TASK_TYPE } from '@/lib/task/types'

const submitTaskMock = vi.hoisted(() => vi.fn())
const projectFindUniqueMock = vi.hoisted(() => vi.fn())
const characterFindUniqueMock = vi.hoisted(() => vi.fn())
const locationFindUniqueMock = vi.hoisted(() => vi.fn())
const propFindUniqueMock = vi.hoisted(() => vi.fn())
const characterAppearanceFindUniqueMock = vi.hoisted(() => vi.fn())
const characterAppearanceUpsertMock = vi.hoisted(() => vi.fn())
const locationImageUpsertMock = vi.hoisted(() => vi.fn())
const propUpdateMock = vi.hoisted(() => vi.fn())

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
    character: {
      findUnique: characterFindUniqueMock,
    },
    location: {
      findUnique: locationFindUniqueMock,
    },
    prop: {
      findUnique: propFindUniqueMock,
      update: propUpdateMock,
    },
    characterAppearance: {
      findUnique: characterAppearanceFindUniqueMock,
      upsert: characterAppearanceUpsertMock,
    },
    locationImage: {
      upsert: locationImageUpsertMock,
    },
  },
}))

describe('api contract - v2 assets routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    submitTaskMock.mockReset()
    projectFindUniqueMock.mockReset()
    characterFindUniqueMock.mockReset()
    locationFindUniqueMock.mockReset()
    propFindUniqueMock.mockReset()
    characterAppearanceFindUniqueMock.mockReset()
    characterAppearanceUpsertMock.mockReset()
    locationImageUpsertMock.mockReset()
    propUpdateMock.mockReset()

    submitTaskMock.mockResolvedValue({
      success: true,
      async: true,
      taskId: 'task-1',
      runId: 'run-1',
      status: 'queued',
      deduped: false,
    })
  })

  it('POST /api/v2/projects/[projectId]/assets/extract 默认提交角色/场景/道具三类抽取任务', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/assets/extract/route')
    projectFindUniqueMock.mockResolvedValueOnce({
      id: 'project-1',
      description: 'desc',
      novelText: 'novel',
      globalContext: 'ctx',
    })

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/assets/extract',
      method: 'POST',
      body: {},
    })

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(202)

    const payload = await res.json() as { ok: boolean; tasks: Array<{ type: string; id: string }> }
    expect(payload.ok).toBe(true)
    expect(payload.tasks).toHaveLength(3)
    expect(payload.tasks.map((task) => task.type)).toEqual([
      TASK_TYPE.EXTRACT_CHARACTERS_LLM,
      TASK_TYPE.EXTRACT_LOCATIONS_LLM,
      TASK_TYPE.EXTRACT_PROPS_LLM,
    ])
    expect(submitTaskMock).toHaveBeenCalledTimes(3)
    expect(submitTaskMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ type: TASK_TYPE.EXTRACT_CHARACTERS_LLM }))
    expect(submitTaskMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ type: TASK_TYPE.EXTRACT_LOCATIONS_LLM }))
    expect(submitTaskMock).toHaveBeenNthCalledWith(3, expect.objectContaining({ type: TASK_TYPE.EXTRACT_PROPS_LLM }))
    const firstSubmit = submitTaskMock.mock.calls[0]?.[0] as {
      dedupeKey?: string | null
      payload?: {
        extractionSchema?: {
          schema?: string
          version?: string
          dedupe?: boolean
          aliasMerge?: boolean
          sourceRefField?: string
        }
        versioning?: {
          compareWithLatest?: boolean
          compareWithTaskId?: string | null
        }
      }
    }
    expect(firstSubmit.dedupeKey).toBe(`${TASK_TYPE.EXTRACT_CHARACTERS_LLM}:project-1`)
    expect(firstSubmit.payload?.extractionSchema).toEqual({
      schema: 'asset_extract',
      version: 'v2',
      dedupe: true,
      aliasMerge: true,
      sourceRefField: 'sourceSegmentIds',
    })
    expect(firstSubmit.payload?.versioning?.compareWithLatest).toBe(true)
    expect(firstSubmit.payload?.versioning?.compareWithTaskId).toBeNull()
  })

  it('POST /api/v2/projects/[projectId]/assets/generate 的 upload 模式会持久化角色图片引用并返回成功', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/assets/generate/route')
    characterFindUniqueMock.mockResolvedValueOnce({
      id: 'character-1',
      projectId: 'project-1',
    })
    characterAppearanceFindUniqueMock.mockResolvedValueOnce({
      imageUrl: 'https://cdn.example.com/character-old.png',
    })

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/assets/generate',
      method: 'POST',
      body: {
        assetType: 'character',
        mode: 'upload',
        assetId: 'character-1',
        uploadUrl: 'https://cdn.example.com/character-1.png',
      },
    })

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)

    const payload = await res.json() as { ok: boolean; mode: string; saved: boolean }
    expect(payload).toEqual({ ok: true, mode: 'upload', saved: true })
    expect(characterAppearanceUpsertMock).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ imageUrl: 'https://cdn.example.com/character-1.png' }),
      update: expect.objectContaining({
        imageUrl: 'https://cdn.example.com/character-1.png',
        previousImageUrl: 'https://cdn.example.com/character-old.png',
      }),
    }))
    expect(submitTaskMock).not.toHaveBeenCalled()
  })

  it('POST /api/v2/projects/[projectId]/assets/generate 的 redo 模式提交创建任务并带 force', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/assets/generate/route')

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/assets/generate',
      method: 'POST',
      body: {
        assetType: 'character',
        mode: 'redo',
        assetId: 'character-1',
        prompt: '重做成冷峻风格',
      },
    })

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(202)

    const payload = await res.json() as { ok: boolean; mode: string; task: { type: string; id: string } }
    expect(payload.ok).toBe(true)
    expect(payload.mode).toBe('redo')
    expect(payload.task.type).toBe(TASK_TYPE.AI_CREATE_CHARACTER)
    expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      type: TASK_TYPE.AI_CREATE_CHARACTER,
      targetType: 'character',
      targetId: 'character-1',
      payload: expect.objectContaining({
        mode: 'redo',
        force: true,
        assetCardSchema: expect.objectContaining({
          schema: 'asset_card',
          version: 'v2',
        }),
        versioning: expect.objectContaining({
          compareWithLatest: true,
          compareWithTaskId: null,
        }),
      }),
    }))
  })

  it('POST /api/v2/projects/[projectId]/assets/views/generate 对角色三视图仅允许 4 宫格', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/assets/views/generate/route')
    characterFindUniqueMock.mockResolvedValueOnce({
      id: 'character-1',
      projectId: 'project-1',
      name: 'A',
    })

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/assets/views/generate',
      method: 'POST',
      body: {
        assetType: 'character',
        assetId: 'character-1',
        layout: 9,
      },
    })

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(400)

    const payload = await res.json() as { code: string; message: string }
    expect(payload.code).toBe('INVALID_PARAMS')
    expect(payload.message).toContain('4 宫格')
  })

  it('POST /api/v2/projects/[projectId]/assets/views/generate 对场景 9 宫格提交多视图任务', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/assets/views/generate/route')
    locationFindUniqueMock.mockResolvedValueOnce({
      id: 'location-1',
      projectId: 'project-1',
      name: 'L',
    })

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/assets/views/generate',
      method: 'POST',
      body: {
        assetType: 'location',
        assetId: 'location-1',
        layout: 9,
        prompt: '夜景霓虹风格',
      },
    })

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(202)

    const payload = await res.json() as {
      ok: boolean
      layout: number
      viewSpec: string[]
      task: { type: string; id: string }
    }
    expect(payload.ok).toBe(true)
    expect(payload.layout).toBe(9)
    expect(payload.viewSpec).toHaveLength(9)
    expect(payload.task.type).toBe(TASK_TYPE.ASSET_HUB_AI_DESIGN_LOCATION)
    expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      type: TASK_TYPE.ASSET_HUB_AI_DESIGN_LOCATION,
      targetType: 'location',
      targetId: 'location-1',
      payload: expect.objectContaining({
        layout: 9,
        viewLayoutMeta: expect.objectContaining({
          schema: 'asset_view_layout',
          version: 'v2',
        }),
        versioning: expect.objectContaining({
          compareWithLatest: true,
          compareWithTaskId: null,
        }),
      }),
    }))
  })

  it('POST /api/v2/projects/[projectId]/assets/views/generate 对场景 16 宫格提交任务并返回 16 视图', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/assets/views/generate/route')
    locationFindUniqueMock.mockResolvedValueOnce({
      id: 'location-1',
      projectId: 'project-1',
      name: 'L',
    })

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/assets/views/generate',
      method: 'POST',
      body: {
        assetType: 'location',
        assetId: 'location-1',
        layout: 16,
      },
    })

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(202)
    const payload = await res.json() as { ok: boolean; layout: number; viewSpec: string[] }
    expect(payload.ok).toBe(true)
    expect(payload.layout).toBe(16)
    expect(payload.viewSpec).toHaveLength(16)
  })
})
