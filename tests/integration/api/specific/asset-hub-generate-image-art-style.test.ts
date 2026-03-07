import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireUserAuth: vi.fn(async () => ({
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
  getUserModelConfig: vi.fn(async () => ({
    analysisModel: null,
    characterModel: 'img::character',
    locationModel: 'img::location',
    storyboardModel: null,
    editModel: null,
    videoModel: null,
    capabilityDefaults: {},
  })),
  buildImageBillingPayloadFromUserConfig: vi.fn((input: { basePayload: Record<string, unknown> }) => ({
    ...input.basePayload,
  })),
}))

const hasOutputMock = vi.hoisted(() => ({
  hasGlobalCharacterOutput: vi.fn(async () => false),
  hasGlobalLocationOutput: vi.fn(async () => false),
}))

const billingMock = vi.hoisted(() => ({
  buildDefaultTaskBillingInfo: vi.fn(() => ({ billable: false })),
}))

const prismaMock = vi.hoisted(() => ({
  globalCharacterAppearance: {
    findFirst: vi.fn(),
  },
  globalLocation: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  globalLocationImage: {
    findMany: vi.fn(async () => []),
    createMany: vi.fn(async () => ({})),
  },
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/task/submitter', () => ({ submitTask: submitTaskMock }))
vi.mock('@/lib/config-service', () => configServiceMock)
vi.mock('@/lib/task/has-output', () => hasOutputMock)
vi.mock('@/lib/billing', () => billingMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/task/resolve-locale', () => ({
  resolveRequiredTaskLocale: vi.fn(() => 'zh'),
}))

describe('api specific - asset hub generate image art style', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses persisted appearance artStyle when request payload does not provide one', async () => {
    prismaMock.globalCharacterAppearance.findFirst.mockResolvedValueOnce({ artStyle: 'realistic' })
    const mod = await import('@/app/api/asset-hub/generate-image/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/generate-image',
      method: 'POST',
      body: {
        type: 'character',
        id: 'character-1',
        appearanceIndex: 0,
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    expect(prismaMock.globalCharacterAppearance.findFirst).toHaveBeenCalled()
    const submitArg = submitTaskMock.mock.calls[0]?.[0] as { payload?: Record<string, unknown> } | undefined
    expect(submitArg?.payload?.artStyle).toBe('realistic')
  })

  it('uses persisted location artStyle when request payload does not provide one', async () => {
    prismaMock.globalLocation.findFirst
      .mockResolvedValueOnce({ artStyle: 'japanese-anime' })
      .mockResolvedValueOnce({ name: 'Location 1', summary: 'Summary 1' })
    const mod = await import('@/app/api/asset-hub/generate-image/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/generate-image',
      method: 'POST',
      body: {
        type: 'location',
        id: 'location-1',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    expect(prismaMock.globalLocation.findFirst).toHaveBeenCalled()
    const submitArg = submitTaskMock.mock.calls[0]?.[0] as { payload?: Record<string, unknown> } | undefined
    expect(submitArg?.payload?.artStyle).toBe('japanese-anime')
    expect(submitArg?.payload?.count).toBe(3)
  })

  it('fails with invalid params when persisted artStyle is missing', async () => {
    prismaMock.globalCharacterAppearance.findFirst.mockResolvedValueOnce({ artStyle: null })
    const mod = await import('@/app/api/asset-hub/generate-image/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/generate-image',
      method: 'POST',
      body: {
        type: 'character',
        id: 'character-1',
        appearanceIndex: 0,
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVALID_PARAMS')
    expect(submitTaskMock).not.toHaveBeenCalled()
  })

  it('forwards requested count into asset hub image task payload', async () => {
    prismaMock.globalCharacterAppearance.findFirst.mockResolvedValueOnce({ artStyle: 'realistic' })
    const mod = await import('@/app/api/asset-hub/generate-image/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/generate-image',
      method: 'POST',
      body: {
        type: 'character',
        id: 'character-1',
        appearanceIndex: 0,
        count: 5,
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    const submitArg = submitTaskMock.mock.calls[0]?.[0] as {
      payload?: Record<string, unknown>
      dedupeKey?: string
    } | undefined
    expect(submitArg?.payload?.count).toBe(5)
    expect(submitArg?.dedupeKey).toContain(':5')
  })
})
