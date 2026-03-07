import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireProjectAuthLight: vi.fn(async () => ({
    session: { user: { id: 'user-1', name: 'User 1' } },
    project: { id: 'project-1', userId: 'user-1', mode: 'novel-promotion', name: 'Project 1' },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const prismaMock = vi.hoisted(() => ({
  novelPromotionProject: {
    findUnique: vi.fn(async () => ({
      analysisModel: 'llm::analysis',
      characterModel: 'img::character',
      locationModel: 'img::location',
      storyboardModel: 'img::storyboard',
      editModel: 'img::edit',
      videoModel: 'video::model',
      audioModel: 'audio::model',
    })),
    update: vi.fn(async () => ({
      id: 'np-1',
      artStyle: 'realistic',
    })),
  },
  userPreference: {
    upsert: vi.fn(async () => ({ userId: 'user-1', artStyle: 'realistic' })),
  },
}))

const mediaAttachMock = vi.hoisted(() => ({
  attachMediaFieldsToProject: vi.fn(async (value: unknown) => value),
}))

const logMock = vi.hoisted(() => ({
  logProjectAction: vi.fn(),
}))

const modelConfigContractMock = vi.hoisted(() => ({
  parseModelKeyStrict: vi.fn(() => ({ provider: 'mock', modelId: 'mock-model' })),
}))

const capabilityLookupMock = vi.hoisted(() => ({
  resolveBuiltinModelContext: vi.fn(() => null),
  getCapabilityOptionFields: vi.fn(() => ({})),
  validateCapabilitySelectionsPayload: vi.fn(() => []),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/media/attach', () => mediaAttachMock)
vi.mock('@/lib/logging/semantic', () => logMock)
vi.mock('@/lib/model-config-contract', () => modelConfigContractMock)
vi.mock('@/lib/model-capabilities/lookup', () => capabilityLookupMock)

describe('api specific - novel promotion project art style validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts valid artStyle and syncs to user preference', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1',
      method: 'PATCH',
      body: {
        artStyle: '  realistic  ',
      },
    })

    const res = await mod.PATCH(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)
    expect(prismaMock.novelPromotionProject.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ artStyle: 'realistic' }),
      }),
    )
    expect(prismaMock.userPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ artStyle: 'realistic' }),
      }),
    )
  })

  it('rejects invalid artStyle with invalid params', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1',
      method: 'PATCH',
      body: {
        artStyle: 'anime',
      },
    })

    const res = await mod.PATCH(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVALID_PARAMS')
    expect(prismaMock.novelPromotionProject.update).not.toHaveBeenCalled()
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('accepts audioModel and syncs it to user preference', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1',
      method: 'PATCH',
      body: {
        audioModel: 'bailian::qwen3-tts-vd-2026-01-26',
      },
    })

    const res = await mod.PATCH(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)
    expect(prismaMock.novelPromotionProject.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          audioModel: 'bailian::qwen3-tts-vd-2026-01-26',
        }),
      }),
    )
    expect(prismaMock.userPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          audioModel: 'bailian::qwen3-tts-vd-2026-01-26',
        }),
      }),
    )
  })
})
