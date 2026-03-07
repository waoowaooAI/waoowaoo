import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireUserAuth: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn(async () => ({
      analysisModel: 'llm::analysis',
      characterModel: 'img::character',
      locationModel: 'img::location',
      storyboardModel: 'img::storyboard',
      editModel: 'img::edit',
      videoModel: 'video::model',
      audioModel: 'audio::tts',
      videoRatio: '9:16',
      artStyle: 'realistic',
      ttsRate: '+0%',
    })),
  },
  project: {
    create: vi.fn(async () => ({
      id: 'project-1',
      name: 'Test Project',
      description: null,
      mode: 'novel-promotion',
      userId: 'user-1',
    })),
  },
  novelPromotionProject: {
    create: vi.fn(async () => ({ id: 'np-1', projectId: 'project-1' })),
  },
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

describe('api specific - project create default audio model', () => {
  const routeContext = { params: Promise.resolve({}) }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('copies user preference audioModel into the new novel promotion project', async () => {
    const mod = await import('@/app/api/projects/route')
    const req = buildMockRequest({
      path: '/api/projects',
      method: 'POST',
      body: {
        name: 'Test Project',
        description: '',
      },
    })

    const res = await mod.POST(req, routeContext)
    expect(res.status).toBe(201)
    expect(prismaMock.novelPromotionProject.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: 'project-1',
        audioModel: 'audio::tts',
      }),
    })
  })
})
