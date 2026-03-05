import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

type AuthState = {
  authenticated: boolean
}

const authState = vi.hoisted<AuthState>(() => ({
  authenticated: true,
}))

const queryRawMock = vi.hoisted(() => vi.fn(async () => []))
const recentFailedFindManyMock = vi.hoisted(() => vi.fn(async () => []))

vi.mock('@/lib/api-auth', () => {
  const unauthorized = () => new Response(
    JSON.stringify({ error: { code: 'UNAUTHORIZED' } }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  )

  return {
    isErrorResponse: (value: unknown) => value instanceof Response,
    requireUserAuth: async () => {
      if (!authState.authenticated) return unauthorized()
      return { session: { user: { id: 'user-1' } } }
    },
  }
})

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: queryRawMock,
    task: {
      findMany: recentFailedFindManyMock,
    },
  },
}))

describe('api contract - ops queue summary route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.authenticated = true
    queryRawMock.mockReset()
    recentFailedFindManyMock.mockReset()
  })

  it('GET /api/ops/queue/summary: unauthenticated returns 401', async () => {
    const { GET } = await import('@/app/api/ops/queue/summary/route')
    authState.authenticated = false

    const req = buildMockRequest({
      path: '/api/ops/queue/summary',
      method: 'GET',
    })
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('GET /api/ops/queue/summary: returns aggregated totals, byType and recentFailed', async () => {
    const { GET } = await import('@/app/api/ops/queue/summary/route')

    queryRawMock
      .mockResolvedValueOnce([
        { status: 'queued', count: 3 },
        { status: 'processing', count: 2 },
        { status: 'failed', count: 1 },
        { status: 'completed', count: 8 },
      ])
      .mockResolvedValueOnce([
        { type: 'IMAGE_CHARACTER', status: 'queued', count: 2 },
        { type: 'IMAGE_CHARACTER', status: 'processing', count: 1 },
        { type: 'VIDEO_PANEL', status: 'failed', count: 1 },
      ])
    recentFailedFindManyMock.mockResolvedValueOnce([
      {
        id: 'task-failed-1',
        type: 'VIDEO_PANEL',
        status: 'failed',
        errorCode: 'EXTERNAL_ERROR',
        errorMessage: 'provider timeout',
        queuedAt: new Date('2026-03-04T10:00:00.000Z'),
      },
    ])

    const req = buildMockRequest({
      path: '/api/ops/queue/summary',
      method: 'GET',
    })
    const res = await GET(req)
    expect(res.status).toBe(200)

    const payload = await res.json() as {
      ok: boolean
      totals: Record<string, number>
      byType: Record<string, Record<string, number>>
      recentFailed: Array<Record<string, unknown>>
      generatedAt: string
    }

    expect(payload.ok).toBe(true)
    expect(payload.totals).toEqual({
      queued: 3,
      processing: 2,
      failed: 1,
      completed: 8,
    })
    expect(payload.byType).toEqual({
      IMAGE_CHARACTER: {
        queued: 2,
        processing: 1,
      },
      VIDEO_PANEL: {
        failed: 1,
      },
    })
    expect(payload.recentFailed).toHaveLength(1)
    expect(payload.recentFailed[0]?.id).toBe('task-failed-1')
    expect(typeof payload.generatedAt).toBe('string')
    expect(queryRawMock).toHaveBeenCalledTimes(2)
    expect(recentFailedFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'failed' },
      take: 20,
    }))
  })
})
