import { describe, expect, it } from 'vitest'
import type { ProjectClip, ProjectPanel, ProjectStoryboard } from '@/types/project'
import { buildProjectCanvasGraph } from '@/lib/project-canvas/graph/build-project-canvas-graph'

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

describe('build project canvas graph', () => {
  it('projects story, clips, storyboard panels, video nodes, and timeline into stable graph nodes and edges', () => {
    const graph = buildProjectCanvasGraph({
      projectId: 'project-1',
      episodeId: 'episode-1',
      storyText: 'A story',
      clips: [
        createClip('clip-1', 'first clip'),
        createClip('clip-2', 'second clip'),
      ],
      storyboards: [
        createStoryboard({
          id: 'storyboard-1',
          clipId: 'clip-1',
          panels: [
            createPanel({ id: 'panel-2', panelIndex: 1, videoPrompt: 'video prompt' }),
            createPanel({ id: 'panel-1', panelIndex: 0, imageUrl: 'https://example.com/panel-1.png' }),
          ],
        }),
      ],
    })

    expect(graph.nodes.map((node) => node.id)).toEqual([
      'story:project-1',
      'scriptClip:clip-1',
      'scriptClip:clip-2',
      'storyboardGroup:storyboard-1',
      'panelImage:panel-1',
      'panelImage:panel-2',
      'videoPanel:panel-2',
      'timeline:episode-1',
    ])
    expect(graph.edges).toContainEqual({
      id: 'edge:panelImage:panel-1->panelImage:panel-2',
      type: 'sequence',
      source: 'panelImage:panel-1',
      target: 'panelImage:panel-2',
    })
    expect(graph.edges).toContainEqual({
      id: 'edge:panelImage:panel-2->videoPanel:panel-2',
      type: 'dependsOn',
      source: 'panelImage:panel-2',
      target: 'videoPanel:panel-2',
    })
    expect(graph.edges).toContainEqual({
      id: 'edge:videoPanel:panel-2->timeline:episode-1',
      type: 'timelinePlacement',
      source: 'videoPanel:panel-2',
      target: 'timeline:episode-1',
    })
  })
})
