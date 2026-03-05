import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const projectFindUniqueMock = vi.hoisted(() => vi.fn())
const timelineProjectFindUniqueMock = vi.hoisted(() => vi.fn())

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
    },
    timelineProject: {
      findUnique: timelineProjectFindUniqueMock,
    },
  },
}))

describe('api contract - v2 exports route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    projectFindUniqueMock.mockReset()
    timelineProjectFindUniqueMock.mockReset()

    projectFindUniqueMock.mockResolvedValue({
      id: 'project-1',
      name: 'iVibeMovie Demo',
      description: 'demo',
      episodes: [
        {
          id: 'episode-1',
          episodeIndex: 0,
          name: '第一集',
          segments: [
            {
              id: 'segment-1',
              segmentIndex: 0,
              summary: '摘要',
              content: '内容',
              screenplay: '剧本段落',
              startTime: 0,
              endTime: 5,
              storyboardEntries: [
                {
                  id: 'entry-1',
                  entryIndex: 0,
                  startTime: 0,
                  endTime: 5,
                  description: '镜头描述',
                  dialogue: '台词',
                  dialogueTone: '低沉',
                  soundEffect: '风声',
                  shotType: 'close-up',
                  cameraMove: 'push-in',
                },
              ],
            },
          ],
        },
      ],
    })
    timelineProjectFindUniqueMock.mockResolvedValue({
      outputUrl: 'https://cdn.example.com/final.mp4',
      projectData: {
        timeline: [
          { src: 'https://cdn.example.com/clip-1.mp4' },
        ],
      },
    })
  })

  it('POST /api/v2/projects/[projectId]/exports script 导出返回统一结构', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/exports/route')

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/exports',
      method: 'POST',
      body: { exportType: 'script' },
    })

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)

    const payload = await res.json() as {
      ok: boolean
      export: { exportType: string; fileName: string; mimeType: string; content: string }
    }
    expect(payload.ok).toBe(true)
    expect(payload.export.exportType).toBe('script')
    expect(payload.export.fileName).toContain('ivibemovie_project-1_script_')
    expect(payload.export.mimeType).toContain('text/plain')
    expect(payload.export.content).toContain('剧本段落')
  })

  it('POST /api/v2/projects/[projectId]/exports storyboard 导出返回 csv', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/exports/route')

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/exports',
      method: 'POST',
      body: { exportType: 'storyboard' },
    })

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)

    const payload = await res.json() as {
      ok: boolean
      export: { exportType: string; mimeType: string; content: string }
    }
    expect(payload.ok).toBe(true)
    expect(payload.export.exportType).toBe('storyboard')
    expect(payload.export.mimeType).toContain('text/csv')
    expect(payload.export.content).toContain('episode_index,segment_index,entry_index')
    expect(payload.export.content).toContain('镜头描述')
  })

  it('POST /api/v2/projects/[projectId]/exports shot_list 导出返回 csv', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/exports/route')

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/exports',
      method: 'POST',
      body: { exportType: 'shot_list' },
    })

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)

    const payload = await res.json() as {
      ok: boolean
      export: { exportType: string; content: string }
    }
    expect(payload.ok).toBe(true)
    expect(payload.export.exportType).toBe('shot_list')
    expect(payload.export.content).toContain('shot_type,camera_move')
    expect(payload.export.content).toContain('close-up')
  })

  it('POST /api/v2/projects/[projectId]/exports video 导出返回视频 URL', async () => {
    const route = await import('@/app/api/v2/projects/[projectId]/exports/route')

    const req = buildMockRequest({
      path: '/api/v2/projects/project-1/exports',
      method: 'POST',
      body: { exportType: 'video' },
    })

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)

    const payload = await res.json() as {
      ok: boolean
      export: { exportType: string; mimeType: string; url: string }
    }
    expect(payload.ok).toBe(true)
    expect(payload.export.exportType).toBe('video')
    expect(payload.export.mimeType).toBe('video/mp4')
    expect(payload.export.url).toBe('https://cdn.example.com/final.mp4')
  })
})
