import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callRoute } from '../../../helpers/request'

const submitTaskMock = vi.hoisted(() => vi.fn())

const prismaMock = vi.hoisted(() => ({
  novelPromotionCharacter: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: `char-${Math.random().toString(36).slice(2, 8)}`,
      ...data,
    })),
  },
  characterAppearance: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: `appearance-${Math.random().toString(36).slice(2, 8)}`,
      ...data,
    })),
    update: vi.fn(async () => ({})),
  },
  novelPromotionLocation: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: `loc-${Math.random().toString(36).slice(2, 8)}`,
      ...data,
    })),
  },
  locationImage: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: `locimg-${Math.random().toString(36).slice(2, 8)}`,
      ...data,
    })),
    update: vi.fn(async () => ({})),
  },
}))

vi.mock('@/lib/api-auth', () => ({
  isErrorResponse: (value: unknown) => value instanceof Response,
  requireProjectAuth: async () => ({
    session: { user: { id: 'user-1' } },
    novelData: { id: 'np-1' },
  }),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

vi.mock('@/lib/task/resolve-locale', () => ({
  resolveRequiredTaskLocale: () => 'vi',
}))

vi.mock('@/lib/config-service', () => ({
  getProjectModelConfig: vi.fn(async () => ({
    characterModel: 'openai-compatible:oa-1::gpt-image-1',
    locationModel: 'openai-compatible:oa-1::gpt-image-1',
  })),
  buildImageBillingPayload: vi.fn(async ({ basePayload }: { basePayload: Record<string, unknown> }) => ({
    ...basePayload,
    model: 'openai-compatible:oa-1::gpt-image-1',
  })),
}))

vi.mock('@/lib/task/submitter', () => ({
  submitTask: submitTaskMock,
}))

describe('api contract - /api/novel-promotion/[projectId]/demo-sample-assets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('prioritizes real generation path when submitTask succeeds', async () => {
    submitTaskMock.mockResolvedValue({ success: true, taskId: 'task-1' })

    const { POST } = await import('@/app/api/novel-promotion/[projectId]/demo-sample-assets/route')

    const res = await callRoute(POST, {
      path: '/api/novel-promotion/project-1/demo-sample-assets',
      method: 'POST',
      body: {
        journeyType: 'film_video',
        selectedCharacterStrategy: 'dynamic-action',
        selectedEnvironmentId: 'city-night-neon',
      },
      context: { params: Promise.resolve({ projectId: 'project-1' }) },
    })

    expect(res.status).toBe(200)
    const body = await res.json() as {
      success: boolean
      mode: 'real' | 'fallback' | 'mixed'
      realTriggered: number
      fallbackApplied: number
      created: { characters: number; locations: number }
    }

    expect(body.success).toBe(true)
    expect(body.mode).toBe('real')
    expect(body.realTriggered).toBe(4)
    expect(body.fallbackApplied).toBe(0)
    expect(body.created).toEqual({ characters: 2, locations: 2 })
    expect(submitTaskMock).toHaveBeenCalledTimes(4)
  })

  it('falls back to mock-safe sample assets when submitTask fails', async () => {
    submitTaskMock.mockRejectedValue(new Error('IMAGE_MODEL_CAPABILITY_NOT_CONFIGURED'))

    const { POST } = await import('@/app/api/novel-promotion/[projectId]/demo-sample-assets/route')

    const res = await callRoute(POST, {
      path: '/api/novel-promotion/project-1/demo-sample-assets',
      method: 'POST',
      body: {
        journeyType: 'manga_webtoon',
        selectedCharacterStrategy: 'emotion-first',
        selectedEnvironmentId: 'forest-mist-dawn',
      },
      context: { params: Promise.resolve({ projectId: 'project-1' }) },
    })

    expect(res.status).toBe(200)
    const body = await res.json() as {
      mode: 'real' | 'fallback' | 'mixed'
      realTriggered: number
      fallbackApplied: number
    }

    expect(body.mode).toBe('fallback')
    expect(body.realTriggered).toBe(0)
    expect(body.fallbackApplied).toBe(4)
    expect(prismaMock.characterAppearance.update).toHaveBeenCalledTimes(2)
    expect(prismaMock.locationImage.update).toHaveBeenCalledTimes(2)
  })
})
