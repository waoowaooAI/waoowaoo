import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireProjectAuthLight: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const submitTaskMock = vi.hoisted(() => vi.fn<(input: unknown) => Promise<{
  success: boolean
  async: boolean
  taskId: string
  status: string
  deduped: boolean
}>>(async () => ({
  success: true,
  async: true,
  taskId: 'task-1',
  status: 'queued',
  deduped: false,
})))

const configServiceMock = vi.hoisted(() => ({
  getProjectModelConfig: vi.fn(async () => ({
    analysisModel: null,
    characterModel: 'img::character',
    locationModel: 'img::location',
    storyboardModel: null,
    editModel: null,
    videoModel: null,
    videoRatio: '16:9',
    artStyle: 'american-comic',
    capabilityDefaults: {},
    capabilityOverrides: {},
  })),
  buildImageBillingPayload: vi.fn(async (input: { basePayload: Record<string, unknown> }) => ({
    ...input.basePayload,
  })),
}))

const hasOutputMock = vi.hoisted(() => ({
  hasCharacterAppearanceOutput: vi.fn(async () => false),
  hasLocationImageOutput: vi.fn(async () => false),
}))

const billingMock = vi.hoisted(() => ({
  buildDefaultTaskBillingInfo: vi.fn(() => ({ billable: false })),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/task/submitter', () => ({ submitTask: submitTaskMock }))
vi.mock('@/lib/config-service', () => configServiceMock)
vi.mock('@/lib/task/has-output', () => hasOutputMock)
vi.mock('@/lib/billing', () => billingMock)
vi.mock('@/lib/task/resolve-locale', () => ({
  resolveRequiredTaskLocale: vi.fn(() => 'zh'),
}))

describe('api specific - novel promotion generate image art style', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts valid artStyle and forwards it into task payload', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/generate-image/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/generate-image',
      method: 'POST',
      body: {
        type: 'character',
        id: 'character-1',
        appearanceId: 'appearance-1',
        artStyle: 'realistic',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)

    const submitArg = submitTaskMock.mock.calls[0]?.[0] as { payload?: Record<string, unknown> } | undefined
    expect(submitArg?.payload?.artStyle).toBe('realistic')
  })

  it('rejects invalid artStyle with invalid params', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/generate-image/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/generate-image',
      method: 'POST',
      body: {
        type: 'character',
        id: 'character-1',
        appearanceId: 'appearance-1',
        artStyle: 'anime',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVALID_PARAMS')
    expect(submitTaskMock).not.toHaveBeenCalled()
  })

  it('forwards requested count into task payload and dedupe key', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/generate-image/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/generate-image',
      method: 'POST',
      body: {
        type: 'character',
        id: 'character-1',
        appearanceId: 'appearance-1',
        count: 6,
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)

    const submitArg = submitTaskMock.mock.calls[0]?.[0] as {
      payload?: Record<string, unknown>
      dedupeKey?: string
    } | undefined
    expect(submitArg?.payload?.count).toBe(6)
    expect(submitArg?.dedupeKey).toBe('image_character:appearance-1:6')
  })
})
