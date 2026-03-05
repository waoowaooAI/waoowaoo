import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const findManyMock = vi.hoisted(() => vi.fn())
const countMock = vi.hoisted(() => vi.fn())
const projectFindManyMock = vi.hoisted(() => vi.fn())
const episodeFindManyMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-auth', () => ({
  isErrorResponse: (value: unknown) => value instanceof Response,
  requireUserAuth: async () => ({ session: { user: { id: 'user-1' } } }),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    balanceTransaction: {
      findMany: findManyMock,
      count: countMock,
    },
    project: {
      findMany: projectFindManyMock,
    },
    episode: {
      findMany: episodeFindManyMock,
    },
  },
}))

describe('api contract - v2 user transactions route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findManyMock.mockResolvedValue([
      {
        id: 'tx-1',
        type: 'consume',
        amount: 1.23,
        balanceAfter: 98.77,
        description: 'modify_asset_image - model - ¥1.23',
        taskType: null,
        projectId: 'project-1',
        episodeId: 'episode-1',
        billingMeta: { unit: 'image', quantity: 1 },
        createdAt: new Date('2026-03-05T08:00:00.000Z'),
      },
    ])
    countMock.mockResolvedValue(1)
    projectFindManyMock.mockResolvedValue([{ id: 'project-1', name: '测试项目' }])
    episodeFindManyMock.mockResolvedValue([{ id: 'episode-1', episodeIndex: 2, name: '第三集' }])
  })

  it('GET /api/v2/user/transactions 返回分页账单流水并补全项目信息', async () => {
    const { GET } = await import('@/app/api/v2/user/transactions/route')
    const req = buildMockRequest({
      path: '/api/v2/user/transactions',
      method: 'GET',
      query: {
        page: 1,
        pageSize: 20,
        type: 'consume',
      },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)

    const payload = await res.json() as {
      ok: boolean
      currency: string
      transactions: Array<{
        id: string
        type: string
        amount: number
        balanceAfter: number
        action: string | null
        projectName: string | null
        episodeNumber: number | null
        episodeName: string | null
        billingMeta: Record<string, unknown> | null
      }>
      pagination: {
        page: number
        pageSize: number
        total: number
        totalPages: number
      }
    }

    expect(payload.ok).toBe(true)
    expect(payload.currency).toBe('CNY')
    expect(payload.transactions).toHaveLength(1)
    expect(payload.transactions[0]).toMatchObject({
      id: 'tx-1',
      type: 'consume',
      amount: 1.23,
      balanceAfter: 98.77,
      action: 'modify_asset_image',
      projectName: '测试项目',
      episodeNumber: 3,
      episodeName: '第三集',
      billingMeta: { unit: 'image', quantity: 1 },
    })
    expect(payload.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    })
  })
})
