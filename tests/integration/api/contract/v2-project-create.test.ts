import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const projectCreateMock = vi.hoisted(() => vi.fn())
const userPreferenceFindUniqueMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-auth', () => ({
  isErrorResponse: (value: unknown) => value instanceof Response,
  requireUserAuth: async () => ({ session: { user: { id: 'user-1' } } }),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userPreference: {
      findUnique: userPreferenceFindUniqueMock,
    },
    project: {
      create: projectCreateMock,
    },
  },
}))

describe('api contract - v2 project create', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    projectCreateMock.mockReset()
    userPreferenceFindUniqueMock.mockReset()
    userPreferenceFindUniqueMock.mockResolvedValue({
      videoModel: 'ark::doubao-seedance-1-0-pro-fast-251015',
    })
  })

  it('rejects invalid duration formula combinations', async () => {
    const { POST } = await import('@/app/api/v2/projects/route')

    const req = buildMockRequest({
      path: '/api/v2/projects',
      method: 'POST',
      body: {
        description: '测试项目',
        segmentDurationSec: 5,
        segmentsPerEpisode: 10,
        episodeCount: 8,
        episodeDurationSec: 40,
      },
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const payload = await res.json() as {
      error?: {
        code?: string
        details?: Record<string, unknown>
      }
    }
    expect(payload.error?.code).toBe('INVALID_PARAMS')
    expect(payload.error?.details?.expectedEpisodeDurationSec).toBe(50)
    expect(payload.error?.details?.actualEpisodeDurationSec).toBe(40)
    expect(projectCreateMock).not.toHaveBeenCalled()
  })

  it('rejects when video model is not configured', async () => {
    const { POST } = await import('@/app/api/v2/projects/route')
    userPreferenceFindUniqueMock.mockResolvedValueOnce(null)

    const req = buildMockRequest({
      path: '/api/v2/projects',
      method: 'POST',
      body: {
        description: '测试项目',
        segmentDurationSec: 5,
        segmentsPerEpisode: 10,
        episodeCount: 8,
      },
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const payload = await res.json() as {
      error?: {
        code?: string
        details?: Record<string, unknown>
      }
    }
    expect(payload.error?.code).toBe('INVALID_PARAMS')
    expect(payload.error?.details?.message).toContain('videoModel 未配置')
    expect(projectCreateMock).not.toHaveBeenCalled()
  })

  it('rejects segment duration above video model limit with correction suggestion', async () => {
    const { POST } = await import('@/app/api/v2/projects/route')
    userPreferenceFindUniqueMock.mockResolvedValueOnce({
      videoModel: 'vidu::viduq1',
    })

    const req = buildMockRequest({
      path: '/api/v2/projects',
      method: 'POST',
      body: {
        description: '测试项目',
        segmentDurationSec: 6,
        segmentsPerEpisode: 2,
        episodeCount: 3,
      },
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const payload = await res.json() as {
      error?: {
        code?: string
        details?: {
          modelSegmentDurationLimitSec?: number
          actualSegmentDurationSec?: number
          videoModel?: string
          suggestion?: {
            segmentDurationSec: number
            segmentsPerEpisode: number
            episodeDurationSec: number
            totalDurationSec: number
          }
        }
      }
    }

    expect(payload.error?.code).toBe('INVALID_PARAMS')
    expect(payload.error?.details?.modelSegmentDurationLimitSec).toBe(5)
    expect(payload.error?.details?.actualSegmentDurationSec).toBe(6)
    expect(payload.error?.details?.videoModel).toBe('vidu::viduq1')
    expect(payload.error?.details?.suggestion?.segmentDurationSec).toBeLessThanOrEqual(5)
    expect(payload.error?.details?.suggestion?.episodeDurationSec).toBeGreaterThanOrEqual(12)
    expect(payload.error?.details?.suggestion?.totalDurationSec).toBe(
      (payload.error?.details?.suggestion?.episodeDurationSec || 0) * 3,
    )
    expect(projectCreateMock).not.toHaveBeenCalled()
  })

  it('creates project and persists computed durations when formula is valid', async () => {
    const { POST } = await import('@/app/api/v2/projects/route')

    projectCreateMock.mockResolvedValueOnce({
      id: 'project-1',
      name: '测试项目 A',
      description: '剧情描述',
      segmentDuration: 6,
      episodeDuration: 72,
      totalDuration: 720,
      episodeCount: 10,
      videoModel: 'ark::doubao-seedance-1-0-pro-fast-251015',
      createdAt: new Date('2026-03-05T00:00:00.000Z'),
      updatedAt: new Date('2026-03-05T00:00:00.000Z'),
    })

    const req = buildMockRequest({
      path: '/api/v2/projects',
      method: 'POST',
      body: {
        name: '测试项目 A',
        description: '剧情描述',
        segmentDurationSec: 6,
        segmentsPerEpisode: 12,
        episodeCount: 10,
      },
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    expect(projectCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: 'user-1',
        segmentDuration: 6,
        episodeDuration: 72,
        totalDuration: 720,
        episodeCount: 10,
        videoModel: 'ark::doubao-seedance-1-0-pro-fast-251015',
      }),
    }))

    const payload = await res.json() as {
      ok: boolean
      project: {
        id: string
        segmentDurationSec: number
        episodeDurationSec: number
        totalDurationSec: number
        videoModel: string
      }
    }

    expect(payload.ok).toBe(true)
    expect(payload.project.id).toBe('project-1')
    expect(payload.project.segmentDurationSec).toBe(6)
    expect(payload.project.episodeDurationSec).toBe(72)
    expect(payload.project.totalDurationSec).toBe(720)
    expect(payload.project.videoModel).toBe('ark::doubao-seedance-1-0-pro-fast-251015')
  })
})
