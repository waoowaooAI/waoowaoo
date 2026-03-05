import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const projectFindUniqueMock = vi.hoisted(() => vi.fn())
const projectUpdateMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-auth', () => ({
  isErrorResponse: (value: unknown) => value instanceof Response,
  requireProjectAuthLight: async (projectId: string) => ({
    session: { user: { id: 'user-1' } },
    project: { id: projectId, userId: 'user-1' },
  }),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    project: {
      findUnique: projectFindUniqueMock,
      update: projectUpdateMock,
    },
  },
}))

describe('api contract - v2 project data route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    projectFindUniqueMock.mockResolvedValue({
      id: 'project-1',
      name: '项目 A',
      description: '描述 A',
      userId: 'user-1',
      segmentDuration: 5,
      episodeDuration: 10,
      totalDuration: 200,
      episodeCount: 20,
      analysisModel: 'openai::gpt-5',
      imageModel: null,
      videoModel: 'ark::doubao-seedance-1-0-pro-fast-251015',
      characterModel: null,
      locationModel: null,
      storyboardModel: null,
      editModel: null,
      artStyle: 'cinematic',
      videoRatio: '9:16',
      capabilityOverrides: null,
      novelText: '原始文本',
      globalContext: '全局上下文',
      createdAt: new Date('2026-03-05T00:00:00.000Z'),
      updatedAt: new Date('2026-03-05T00:10:00.000Z'),
      episodes: [
        {
          id: 'ep-1',
          episodeIndex: 0,
          name: '第一集',
          novelText: '第一集内容',
          audioUrl: null,
          srtContent: null,
          createdAt: new Date('2026-03-05T00:20:00.000Z'),
        },
      ],
      characters: [
        {
          id: 'ch-1',
          name: '王仙芝',
          aliases: [],
          introduction: '剑道宗师',
          voicePresetId: null,
          profileData: { identity: '宗师' },
          profileConfirmed: true,
          appearances: [
            {
              id: 'ap-1',
              appearanceIndex: 0,
              description: '麻衣白发',
              imageUrl: 'https://cdn.example.com/a.png',
              previousImageUrl: null,
            },
          ],
        },
      ],
      locations: [
        {
          id: 'loc-1',
          name: '雪原',
          summary: '风雪战场',
          locationImages: [
            {
              id: 'li-1',
              imageIndex: 0,
              description: '雪夜',
              imageUrl: 'https://cdn.example.com/l.png',
              previousImageUrl: null,
              isSelected: true,
            },
          ],
        },
      ],
    })
    projectUpdateMock.mockResolvedValue({})
  })

  it('GET /api/v2/projects/[projectId]/data 返回工作台可用结构', async () => {
    const { GET } = await import('@/app/api/v2/projects/[projectId]/data/route')
    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/data',
      method: 'GET',
    })

    const res = await GET(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)
    const payload = await res.json() as {
      ok: boolean
      project: {
        id: string
        mode: string
        novelPromotionData: {
          importStatus: string
          episodes: Array<{ id: string; episodeNumber: number }>
          characters: Array<{ id: string; appearances: Array<{ imageUrls: string[] }> }>
          locations: Array<{ id: string; selectedImageId: string | null }>
        }
      }
    }

    expect(payload.ok).toBe(true)
    expect(payload.project.id).toBe('project-1')
    expect(payload.project.mode).toBe('novel-promotion')
    expect(payload.project.novelPromotionData.importStatus).toBe('completed')
    expect(payload.project.novelPromotionData.episodes[0]).toMatchObject({
      id: 'ep-1',
      episodeNumber: 1,
    })
    expect(payload.project.novelPromotionData.characters[0].appearances[0].imageUrls).toEqual([
      'https://cdn.example.com/a.png',
    ])
    expect(payload.project.novelPromotionData.locations[0].selectedImageId).toBe('li-1')
    expect(projectUpdateMock).toHaveBeenCalledTimes(1)
  })
})
