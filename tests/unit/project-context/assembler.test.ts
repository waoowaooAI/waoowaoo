import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
  },
  projectEpisode: {
    findUnique: vi.fn(),
  },
  planApproval: {
    findMany: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

const runRuntimeMock = vi.hoisted(() => ({
  listRuns: vi.fn(),
  listArtifacts: vi.fn(),
}))

vi.mock('@/lib/run-runtime/service', () => runRuntimeMock)

describe('assembleProjectContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('includes panel image/video fields in workflow panels snapshot', async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: 'project-1',
      name: 'p',
      videoRatio: '16:9',
      artStyle: 'x',
      analysisModel: null,
    })
    prismaMock.projectEpisode.findUnique.mockResolvedValueOnce({
      id: 'episode-1',
      name: 'e',
      novelText: null,
      clips: [
        {
          id: 'clip-1',
          summary: 's',
          screenplay: null,
          storyboard: {
            id: 'storyboard-1',
            panels: [
              {
                id: 'panel-1',
                panelIndex: 0,
                description: 'd',
                imagePrompt: 'ip',
                imageUrl: 'https://img',
                imageMediaId: 'm1',
                candidateImages: '[]',
                videoPrompt: 'vp',
                videoUrl: 'https://vid',
                videoMediaId: 'vm1',
                updatedAt: new Date('2026-04-20T00:00:00.000Z'),
              },
            ],
          },
        },
      ],
      voiceLines: [],
    })
    runRuntimeMock.listRuns.mockResolvedValueOnce([])
    runRuntimeMock.listRuns.mockResolvedValueOnce([])
    runRuntimeMock.listArtifacts.mockResolvedValueOnce([])
    prismaMock.planApproval.findMany.mockResolvedValueOnce([])

    const mod = await import('@/lib/project-context/assembler')

    const context = await mod.assembleProjectContext({
      projectId: 'project-1',
      userId: 'user-1',
      episodeId: 'episode-1',
      currentStage: null,
      selectedScopeRef: null,
    })

    expect(context.workflow?.panels).toEqual([
      {
        panelId: 'panel-1',
        clipId: 'clip-1',
        storyboardId: 'storyboard-1',
        panelIndex: 0,
        description: 'd',
        imagePrompt: 'ip',
        imageUrl: 'https://img',
        imageMediaId: 'm1',
        candidateImages: '[]',
        videoPrompt: 'vp',
        videoUrl: 'https://vid',
        videoMediaId: 'vm1',
        updatedAt: '2026-04-20T00:00:00.000Z',
      },
    ])
  })
})

