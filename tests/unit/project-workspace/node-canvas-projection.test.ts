import { describe, expect, it } from 'vitest'
import type { ProjectClip, ProjectPanel, ProjectStoryboard } from '@/types/project'
import {
  buildWorkspaceNodeCanvasProjection,
} from '@/features/project-workspace/canvas/hooks/useWorkspaceNodeCanvasProjection'

function t(key: string, values?: Record<string, string | number>): string {
  if (!values) return key
  return `${key}:${JSON.stringify(values)}`
}

function createClip(id: string, content: string): ProjectClip {
  return {
    id,
    summary: `${id} summary`,
    location: null,
    characters: null,
    props: null,
    content,
    screenplay: null,
  }
}

function createPanel(input: Partial<ProjectPanel> & Pick<ProjectPanel, 'id' | 'panelIndex'>): ProjectPanel {
  return {
    id: input.id,
    storyboardId: input.storyboardId ?? 'storyboard-1',
    panelIndex: input.panelIndex,
    panelNumber: input.panelNumber ?? input.panelIndex + 1,
    shotType: input.shotType ?? null,
    cameraMove: input.cameraMove ?? null,
    description: input.description ?? null,
    location: input.location ?? null,
    characters: input.characters ?? null,
    props: input.props ?? null,
    srtSegment: input.srtSegment ?? null,
    srtStart: input.srtStart ?? null,
    srtEnd: input.srtEnd ?? null,
    duration: input.duration ?? null,
    imagePrompt: input.imagePrompt ?? null,
    imageUrl: input.imageUrl ?? null,
    candidateImages: input.candidateImages ?? null,
    media: input.media ?? null,
    imageHistory: input.imageHistory ?? null,
    videoPrompt: input.videoPrompt ?? null,
    firstLastFramePrompt: input.firstLastFramePrompt ?? null,
    videoUrl: input.videoUrl ?? null,
    videoGenerationMode: input.videoGenerationMode ?? null,
    lastVideoGenerationOptions: input.lastVideoGenerationOptions ?? null,
    videoMedia: input.videoMedia ?? null,
    lipSyncVideoUrl: input.lipSyncVideoUrl ?? null,
    lipSyncVideoMedia: input.lipSyncVideoMedia ?? null,
    sketchImageUrl: input.sketchImageUrl ?? null,
    sketchImageMedia: input.sketchImageMedia ?? null,
    previousImageUrl: input.previousImageUrl ?? null,
    previousImageMedia: input.previousImageMedia ?? null,
    photographyRules: input.photographyRules ?? null,
    actingNotes: input.actingNotes ?? null,
    imageTaskRunning: input.imageTaskRunning ?? false,
    videoTaskRunning: input.videoTaskRunning ?? false,
    imageErrorMessage: input.imageErrorMessage ?? null,
  }
}

function createStoryboard(input: {
  readonly id: string
  readonly clipId: string
  readonly panels: ProjectPanel[]
}): ProjectStoryboard {
  return {
    id: input.id,
    episodeId: 'episode-1',
    clipId: input.clipId,
    storyboardTextJson: null,
    panelCount: input.panels.length,
    storyboardImageUrl: null,
    candidateImages: null,
    lastError: null,
    photographyPlan: null,
    panels: input.panels,
  }
}

describe('workspace node canvas projection', () => {
  it('shows only the story input node when the episode has no story data', () => {
    const projection = buildWorkspaceNodeCanvasProjection({
      episodeId: 'episode-1',
      storyText: '',
      clips: [],
      storyboards: [],
      savedLayouts: [],
      translate: t,
    })

    expect(projection.nodes.map((node) => node.id)).toEqual(['story:episode-1'])
    expect(projection.edges).toEqual([])
  })

  it('projects real story, clips, shots, image nodes, video nodes, and final timeline without mock data', () => {
    const projection = buildWorkspaceNodeCanvasProjection({
      episodeId: 'episode-1',
      storyText: 'A real story',
      clips: [
        createClip('clip-1', 'first clip content'),
        createClip('clip-2', 'second clip content'),
      ],
      storyboards: [
        createStoryboard({
          id: 'storyboard-1',
          clipId: 'clip-1',
          panels: [
            createPanel({
              id: 'panel-2',
              panelIndex: 1,
              description: 'second panel',
              videoUrl: 'https://example.com/panel-2.mp4',
            }),
            createPanel({
              id: 'panel-1',
              panelIndex: 0,
              description: 'first panel',
              imageUrl: 'https://example.com/panel-1.png',
            }),
          ],
        }),
      ],
      savedLayouts: [],
      translate: t,
    })

    expect(projection.nodes.map((node) => node.id)).toEqual([
      'story:episode-1',
      'analysis:episode-1',
      'clip:clip-1',
      'clip:clip-2',
      'shot:panel-1',
      'shot:panel-2',
      'image:panel-1',
      'video:panel-2',
      'final:episode-1',
    ])
    expect(projection.edges.map((edge) => `${edge.source}->${edge.target}`)).toContain('story:episode-1->analysis:episode-1')
    expect(projection.edges.map((edge) => `${edge.source}->${edge.target}`)).toContain('clip:clip-1->shot:panel-1')
    expect(projection.edges.map((edge) => `${edge.source}->${edge.target}`)).toContain('video:panel-2->final:episode-1')

    const shotNode = projection.nodes.find((node) => node.id === 'shot:panel-1')
    const imageNode = projection.nodes.find((node) => node.id === 'image:panel-1')
    expect(shotNode?.data.action).toEqual({ type: 'generate_image', panelId: 'panel-1' })
    expect(imageNode?.data.action).toEqual({ type: 'generate_image', panelId: 'panel-1' })
  })

  it('uses saved layout only for node position and preserves business ordering', () => {
    const projection = buildWorkspaceNodeCanvasProjection({
      episodeId: 'episode-1',
      storyText: 'A real story',
      clips: [createClip('clip-1', 'clip content')],
      storyboards: [
        createStoryboard({
          id: 'storyboard-1',
          clipId: 'clip-1',
          panels: [
            createPanel({ id: 'panel-late', panelIndex: 9, panelNumber: 9 }),
            createPanel({ id: 'panel-early', panelIndex: 0, panelNumber: 1 }),
          ],
        }),
      ],
      savedLayouts: [
        {
          nodeKey: 'shot:panel-early',
          x: 999,
          y: 888,
          width: 320,
          height: 214,
          zIndex: 0,
          locked: false,
          collapsed: false,
        },
      ],
      translate: t,
    })

    const shotNodes = projection.nodes.filter((node) => node.data.kind === 'shot')
    expect(shotNodes.map((node) => node.id)).toEqual(['shot:panel-early', 'shot:panel-late'])
    expect(shotNodes[0].position).toEqual({ x: 999, y: 888 })
  })
})
