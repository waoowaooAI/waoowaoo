import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  projectClip: {
    findMany: vi.fn(),
  },
  projectStoryboard: {
    findMany: vi.fn(),
  },
  projectPanel: {
    count: vi.fn(),
    findMany: vi.fn(),
    groupBy: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

const liteMock = vi.hoisted(() => ({
  assembleProjectProjectionLite: vi.fn(),
}))

vi.mock('@/lib/project-projection/lite', () => liteMock)

import { assembleProjectProjectionFull } from '@/lib/project-projection/full'

describe('assembleProjectProjectionFull', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('[episode present] -> returns panels with image/video fields and truncation flag', async () => {
    liteMock.assembleProjectProjectionLite.mockResolvedValueOnce({
      projectId: 'project-1',
      projectName: 'p',
      episodeId: 'episode-1',
      episodeName: 'e',
      currentStage: null,
      selectedScopeRef: null,
      policy: {
        projectId: 'project-1',
        episodeId: 'episode-1',
        videoRatio: '16:9',
        artStyle: 'x',
        analysisModel: null,
        overrides: {},
      },
      progress: {
        clipCount: 1,
        screenplayClipCount: 0,
        storyboardCount: 1,
        panelCount: 5,
        voiceLineCount: 0,
      },
      activeRuns: [],
      latestArtifacts: [],
      approvals: [],
    })

    prismaMock.projectPanel.count.mockResolvedValueOnce(5)
    prismaMock.projectPanel.findMany.mockResolvedValueOnce([
      {
        id: 'panel-1',
        storyboardId: 'storyboard-1',
        panelIndex: 0,
        panelNumber: 1,
        shotType: null,
        cameraMove: null,
        description: 'd',
        location: null,
        characters: null,
        props: null,
        duration: 1,
        imagePrompt: 'ip',
        imageUrl: 'https://img',
        imageMediaId: 'm1',
        candidateImages: '[]',
        videoPrompt: 'vp',
        videoUrl: 'https://vid',
        videoMediaId: 'vm1',
        createdAt: new Date('2026-04-20T00:00:00.000Z'),
        updatedAt: new Date('2026-04-20T00:00:00.000Z'),
        storyboard: {
          clipId: 'clip-1',
        },
      },
    ])
    prismaMock.projectStoryboard.findMany.mockResolvedValueOnce([
      {
        id: 'storyboard-1',
        clipId: 'clip-1',
      },
    ])
    prismaMock.projectClip.findMany.mockResolvedValueOnce([
      {
        id: 'clip-1',
        summary: 's',
      },
    ])
    prismaMock.projectPanel.groupBy.mockResolvedValueOnce([
      { storyboardId: 'storyboard-1', _count: { _all: 5 } },
    ])

    const result = await assembleProjectProjectionFull({
      projectId: 'project-1',
      userId: 'user-1',
      episodeId: 'episode-1',
      panelLimit: 1,
    })

    expect(result.workflow?.panels).toEqual([
      expect.objectContaining({
        panelId: 'panel-1',
        clipId: 'clip-1',
        storyboardId: 'storyboard-1',
        panelIndex: 0,
        imagePrompt: 'ip',
        imageUrl: 'https://img',
        imageMediaId: 'm1',
        candidateImages: '[]',
        videoPrompt: 'vp',
        videoUrl: 'https://vid',
        videoMediaId: 'vm1',
      }),
    ])
    expect(result.workflow?.panelLimit).toBe(1)
    expect(result.workflow?.totalPanelCount).toBe(5)
    expect(result.workflow?.truncated).toBe(true)
  })

  it('[no episode] -> workflow null', async () => {
    liteMock.assembleProjectProjectionLite.mockResolvedValueOnce({
      projectId: 'project-1',
      projectName: 'p',
      episodeId: null,
      episodeName: null,
      currentStage: null,
      selectedScopeRef: null,
      policy: {
        projectId: 'project-1',
        episodeId: null,
        videoRatio: '16:9',
        artStyle: 'x',
        analysisModel: null,
        overrides: {},
      },
      progress: {
        clipCount: 0,
        screenplayClipCount: 0,
        storyboardCount: 0,
        panelCount: 0,
        voiceLineCount: 0,
      },
      activeRuns: [],
      latestArtifacts: [],
      approvals: [],
    })

    const result = await assembleProjectProjectionFull({
      projectId: 'project-1',
      userId: 'user-1',
      episodeId: null,
    })

    expect(result.workflow).toBeNull()
    expect(prismaMock.projectPanel.findMany).not.toHaveBeenCalled()
  })

  it('[scope panelId] -> restricts storyboard query to panel storyboard and not truncated', async () => {
    liteMock.assembleProjectProjectionLite.mockResolvedValueOnce({
      projectId: 'project-1',
      projectName: 'p',
      episodeId: 'episode-1',
      episodeName: 'e',
      currentStage: null,
      selectedScopeRef: null,
      policy: {
        projectId: 'project-1',
        episodeId: 'episode-1',
        videoRatio: '16:9',
        artStyle: 'x',
        analysisModel: null,
        overrides: {},
      },
      progress: {
        clipCount: 1,
        screenplayClipCount: 0,
        storyboardCount: 1,
        panelCount: 1,
        voiceLineCount: 0,
      },
      activeRuns: [],
      latestArtifacts: [],
      approvals: [],
    })

    prismaMock.projectPanel.count.mockResolvedValueOnce(1)
    prismaMock.projectPanel.findMany.mockResolvedValueOnce([
      {
        id: 'panel-1',
        storyboardId: 'storyboard-1',
        panelIndex: 0,
        panelNumber: 1,
        shotType: null,
        cameraMove: null,
        description: 'd',
        location: null,
        characters: null,
        props: null,
        duration: 1,
        imagePrompt: 'ip',
        imageUrl: null,
        imageMediaId: null,
        candidateImages: null,
        videoPrompt: null,
        videoUrl: null,
        videoMediaId: null,
        createdAt: new Date('2026-04-20T00:00:00.000Z'),
        updatedAt: new Date('2026-04-20T00:00:00.000Z'),
        storyboard: {
          clipId: 'clip-1',
        },
      },
    ])
    prismaMock.projectStoryboard.findMany.mockResolvedValueOnce([
      {
        id: 'storyboard-1',
        clipId: 'clip-1',
      },
    ])
    prismaMock.projectClip.findMany.mockResolvedValueOnce([
      {
        id: 'clip-1',
        summary: 's',
      },
    ])
    prismaMock.projectPanel.groupBy.mockResolvedValueOnce([
      { storyboardId: 'storyboard-1', _count: { _all: 1 } },
    ])

    const result = await assembleProjectProjectionFull({
      projectId: 'project-1',
      userId: 'user-1',
      episodeId: 'episode-1',
      panelLimit: 10,
      scope: { panelId: 'panel-1' },
    })

    expect(prismaMock.projectStoryboard.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'storyboard-1' },
    }))
    expect(result.workflow?.totalPanelCount).toBe(1)
    expect(result.workflow?.truncated).toBe(false)
  })
})
