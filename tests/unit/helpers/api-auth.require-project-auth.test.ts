import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const prismaMock = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
  },
}))

const getServerSessionMock = vi.hoisted(() => vi.fn(async () => ({
  user: { id: 'user-1', name: 'Tester' },
})))

const withPrismaRetryMock = vi.hoisted(() => vi.fn(async <T>(fn: () => Promise<T>) => await fn()))

vi.mock('next-auth/next', () => ({
  getServerSession: getServerSessionMock,
}))

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}))

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/prisma-retry', () => ({
  withPrismaRetry: withPrismaRetryMock,
}))

vi.mock('@/lib/config-service', () => ({
  extractModelKey: vi.fn((value: string | null | undefined) => value ?? null),
}))

vi.mock('@/lib/logging/context', () => ({
  getLogContext: vi.fn(() => ({ requestId: null })),
  setLogContext: vi.fn(),
}))

import { requireProjectAuth } from '@/lib/api-auth'

describe('requireProjectAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getServerSessionMock.mockResolvedValue({
      user: { id: 'user-1', name: 'Tester' },
    })
  })

  it('loads project with requested includes and returns flattened projectData', async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      id: 'project-1',
      userId: 'user-1',
      name: 'Project One',
      analysisModel: 'llm::analysis',
      characters: [{ name: 'Hero' }],
    })

    const result = await requireProjectAuth('project-1', {
      include: { characters: true },
    })

    expect(result).not.toBeInstanceOf(NextResponse)
    if (result instanceof NextResponse) {
      throw new Error('Expected auth context')
    }

    expect(prismaMock.project.findUnique).toHaveBeenCalledWith({
      where: { id: 'project-1' },
      include: { characters: true },
    })
    expect(result.projectData).toEqual(expect.objectContaining({
      id: 'project-1',
      analysisModel: 'llm::analysis',
      characters: [{ name: 'Hero' }],
      characterModel: null,
      locationModel: null,
      storyboardModel: null,
      editModel: null,
      videoModel: null,
      audioModel: null,
    }))
  })

  it('returns not found when project data is missing', async () => {
    prismaMock.project.findUnique.mockResolvedValue(null)

    const result = await requireProjectAuth('project-1')

    expect(result).toBeInstanceOf(NextResponse)
    if (!(result instanceof NextResponse)) {
      throw new Error('Expected error response')
    }

    expect(result.status).toBe(404)
    await expect(result.json()).resolves.toEqual(expect.objectContaining({
      code: 'NOT_FOUND',
      message: 'Project not found',
    }))
  })
})
