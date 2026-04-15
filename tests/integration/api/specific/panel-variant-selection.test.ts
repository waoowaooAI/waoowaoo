import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

type PanelRecord = {
  id: string
  storyboardId: string
  panelIndex: number
  shotType: string
  cameraMove: string
  description: string
  videoPrompt: string
  location: string
  characters: string
  srtSegment: string
  duration: number
}

type StoryboardRecord = {
  id: string
  episode: {
    projectId: string
  }
}

const authMock = vi.hoisted(() => ({
  requireProjectAuthLight: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
    project: { id: 'project-1', userId: 'user-1' },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const submitTaskMock = vi.hoisted(() => vi.fn<typeof import('@/lib/task/submitter').submitTask>(async () => ({
  success: true,
  async: true,
  taskId: 'task-panel-variant',
  runId: null,
  status: 'queued',
  deduped: false,
})))

const configServiceMock = vi.hoisted(() => ({
  getProjectModelConfig: vi.fn(async () => ({
    storyboardModel: 'img::storyboard',
  })),
  buildImageBillingPayload: vi.fn(async (input: { basePayload: Record<string, unknown> }) => ({
    ...input.basePayload,
    generationOptions: { resolution: '1024x1024' },
  })),
}))

const rollbackSpy = vi.hoisted(() => ({
  delete: vi.fn(async () => ({})),
  findFirst: vi.fn(async () => ({ panelIndex: 4 })),
  updateMany: vi.fn(async () => ({ count: 2 })),
  count: vi.fn(async () => 3),
  storyboardUpdate: vi.fn(async () => ({})),
}))

const createTxSpy = vi.hoisted(() => ({
  findMany: vi.fn(async () => [
    { id: 'panel-after-1', panelIndex: 2 },
    { id: 'panel-after-2', panelIndex: 3 },
  ]),
  update: vi.fn(async () => ({})),
  create: vi.fn(async (args: { data: PanelRecord }) => ({
    id: args.data.id,
    panelIndex: args.data.panelIndex,
  })),
  count: vi.fn(async () => 4),
  storyboardUpdate: vi.fn(async () => ({})),
}))

const routeState = vi.hoisted(() => ({
  storyboard: {
    id: 'storyboard-1',
    episode: {
      projectId: 'project-1',
    },
  } satisfies StoryboardRecord,
  panels: new Map<string, PanelRecord>(),
}))

const prismaMock = vi.hoisted(() => ({
  projectStoryboard: {
    findUnique: vi.fn(async () => routeState.storyboard),
  },
  projectPanel: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => routeState.panels.get(where.id) ?? null),
  },
  $transaction: vi.fn(async (
    fn: (tx: {
      projectPanel: {
        findMany: typeof createTxSpy.findMany
        update: typeof createTxSpy.update
        create: typeof createTxSpy.create
        delete: typeof rollbackSpy.delete
        findFirst: typeof rollbackSpy.findFirst
        updateMany: typeof rollbackSpy.updateMany
        count: typeof rollbackSpy.count
      }
      projectStoryboard: {
        update: typeof createTxSpy.storyboardUpdate
      }
    }) => Promise<unknown>,
  ) => {
    const invocation = prismaMock.$transaction.mock.calls.length
    if (invocation > 1) {
      return await fn({
        projectPanel: {
          findMany: createTxSpy.findMany,
          update: createTxSpy.update,
          create: createTxSpy.create,
          delete: rollbackSpy.delete,
          findFirst: rollbackSpy.findFirst,
          updateMany: rollbackSpy.updateMany,
          count: rollbackSpy.count,
        },
        projectStoryboard: {
          update: rollbackSpy.storyboardUpdate,
        },
      })
    }

    return await fn({
      projectPanel: {
        findMany: createTxSpy.findMany,
        update: createTxSpy.update,
        create: createTxSpy.create,
        delete: rollbackSpy.delete,
        findFirst: rollbackSpy.findFirst,
        updateMany: rollbackSpy.updateMany,
        count: rollbackSpy.count,
      },
      projectStoryboard: {
        update: createTxSpy.storyboardUpdate,
      },
    })
  }),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/task/submitter', () => ({ submitTask: submitTaskMock }))
vi.mock('@/lib/config-service', () => configServiceMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/billing', () => ({
  buildDefaultTaskBillingInfo: vi.fn(() => ({ mode: 'default' })),
}))
vi.mock('@/lib/task/resolve-locale', () => ({
  resolveRequiredTaskLocale: vi.fn(() => 'zh'),
}))

function buildPanel(id: string, storyboardId: string, panelIndex: number): PanelRecord {
  return {
    id,
    storyboardId,
    panelIndex,
    shotType: 'medium',
    cameraMove: 'static',
    description: `description-${id}`,
    videoPrompt: `prompt-${id}`,
    location: 'Old Town',
    characters: '[]',
    srtSegment: '',
    duration: 3,
  }
}

async function invokeRoute(body: Record<string, unknown>): Promise<Response> {
  const mod = await import('@/app/api/projects/[projectId]/panel-variant/route')
  const req = buildMockRequest({
    path: '/api/projects/project-1/panel-variant',
    method: 'POST',
    body,
  })
  return await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
}

describe('api specific - panel variant route', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    routeState.storyboard = {
      id: 'storyboard-1',
      episode: {
        projectId: 'project-1',
      },
    }
    routeState.panels = new Map<string, PanelRecord>([
      ['panel-src', buildPanel('panel-src', 'storyboard-1', 1)],
      ['panel-ins', buildPanel('panel-ins', 'storyboard-1', 2)],
    ])
  })

  it('returns INVALID_PARAMS when sourcePanelId does not belong to storyboardId', async () => {
    routeState.panels.set('panel-src', buildPanel('panel-src', 'storyboard-other', 1))

    const res = await invokeRoute({
      storyboardId: 'storyboard-1',
      insertAfterPanelId: 'panel-ins',
      sourcePanelId: 'panel-src',
      variant: { video_prompt: 'variant prompt', description: 'variant desc' },
    })

    const json = await res.json() as { error: { code: string } }
    expect(res.status).toBe(400)
    expect(json.error.code).toBe('INVALID_PARAMS')
    expect(createTxSpy.create).not.toHaveBeenCalled()
    expect(submitTaskMock).not.toHaveBeenCalled()
  })

  it('returns INVALID_PARAMS when insertAfterPanelId does not belong to storyboardId', async () => {
    routeState.panels.set('panel-ins', buildPanel('panel-ins', 'storyboard-other', 2))

    const res = await invokeRoute({
      storyboardId: 'storyboard-1',
      insertAfterPanelId: 'panel-ins',
      sourcePanelId: 'panel-src',
      variant: { video_prompt: 'variant prompt', description: 'variant desc' },
    })

    const json = await res.json() as { error: { code: string } }
    expect(res.status).toBe(400)
    expect(json.error.code).toBe('INVALID_PARAMS')
    expect(createTxSpy.create).not.toHaveBeenCalled()
    expect(submitTaskMock).not.toHaveBeenCalled()
  })

  it('does not create panel when image billing payload validation fails', async () => {
    configServiceMock.buildImageBillingPayload.mockRejectedValueOnce(new Error('missing capability'))

    const res = await invokeRoute({
      storyboardId: 'storyboard-1',
      insertAfterPanelId: 'panel-ins',
      sourcePanelId: 'panel-src',
      variant: { video_prompt: 'variant prompt', description: 'variant desc' },
    })

    const json = await res.json() as { error: { code: string; message: string } }
    expect(res.status).toBe(400)
    expect(json.error.code).toBe('INVALID_PARAMS')
    expect(json.error.message).toBe('missing capability')
    expect(createTxSpy.create).not.toHaveBeenCalled()
    expect(submitTaskMock).not.toHaveBeenCalled()
  })

  it('rolls back the created panel when submitTask fails after insertion', async () => {
    submitTaskMock.mockRejectedValueOnce(new Error('queue unavailable'))

    const res = await invokeRoute({
      storyboardId: 'storyboard-1',
      insertAfterPanelId: 'panel-ins',
      sourcePanelId: 'panel-src',
      variant: { video_prompt: 'variant prompt', description: 'variant desc' },
    })

    const json = await res.json() as { error: { code: string } }
    expect(res.status).toBe(502)
    expect(json.error.code).toBe('EXTERNAL_ERROR')

    expect(createTxSpy.create).toHaveBeenCalledTimes(1)
    const createdPanelId = createTxSpy.create.mock.calls[0]?.[0].data.id
    expect(createdPanelId).toEqual(expect.any(String))
    expect(rollbackSpy.delete).toHaveBeenCalledWith({
      where: { id: createdPanelId },
    })
    expect(rollbackSpy.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        storyboardId: 'storyboard-1',
        panelIndex: { gt: 3 },
      },
      data: {
        panelIndex: { increment: 1004 },
        panelNumber: { increment: 1004 },
      },
    })
    expect(rollbackSpy.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        storyboardId: 'storyboard-1',
        panelIndex: { gt: 1007 },
      },
      data: {
        panelIndex: { decrement: 1005 },
        panelNumber: { decrement: 1005 },
      },
    })
    expect(rollbackSpy.storyboardUpdate).toHaveBeenCalledWith({
      where: { id: 'storyboard-1' },
      data: { panelCount: 3 },
    })
  })
})
