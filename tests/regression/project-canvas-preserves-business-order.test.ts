import { describe, expect, it } from 'vitest'
import type { ProjectClip, ProjectPanel, ProjectStoryboard } from '@/types/project'
import {
  buildWorkspaceNodeCanvasProjection,
} from '@/features/project-workspace/canvas/hooks/useWorkspaceNodeCanvasProjection'

function t(key: string): string {
  return key
}

function clip(id: string): ProjectClip {
  return {
    id,
    summary: id,
    location: null,
    characters: null,
    props: null,
    content: id,
    screenplay: null,
  }
}

function panel(id: string, panelIndex: number): ProjectPanel {
  return {
    id,
    storyboardId: 'storyboard-1',
    panelIndex,
    panelNumber: panelIndex + 1,
    shotType: null,
    cameraMove: null,
    description: id,
    location: null,
    characters: null,
    props: null,
    srtSegment: null,
    srtStart: null,
    srtEnd: null,
    duration: null,
    imagePrompt: null,
    imageUrl: null,
    candidateImages: null,
    media: null,
    imageHistory: null,
    videoPrompt: null,
    firstLastFramePrompt: null,
    videoUrl: null,
    videoGenerationMode: null,
    lastVideoGenerationOptions: null,
    videoMedia: null,
    lipSyncVideoUrl: null,
    lipSyncVideoMedia: null,
    sketchImageUrl: null,
    sketchImageMedia: null,
    previousImageUrl: null,
    previousImageMedia: null,
    photographyRules: null,
    actingNotes: null,
    imageTaskRunning: false,
    videoTaskRunning: false,
    imageErrorMessage: null,
  }
}

function storyboard(panels: ProjectPanel[]): ProjectStoryboard {
  return {
    id: 'storyboard-1',
    episodeId: 'episode-1',
    clipId: 'clip-1',
    storyboardTextJson: null,
    panelCount: panels.length,
    storyboardImageUrl: null,
    candidateImages: null,
    lastError: null,
    photographyPlan: null,
    panels,
  }
}

describe('project canvas preserves business order', () => {
  it('does not derive shot order from saved canvas positions', () => {
    const projection = buildWorkspaceNodeCanvasProjection({
      episodeId: 'episode-1',
      storyText: 'story',
      clips: [clip('clip-1')],
      storyboards: [storyboard([panel('panel-2', 1), panel('panel-1', 0)])],
      savedLayouts: [
        {
          nodeKey: 'shot:panel-2',
          x: 0,
          y: 0,
          width: 320,
          height: 214,
          zIndex: 0,
          locked: false,
          collapsed: false,
        },
        {
          nodeKey: 'shot:panel-1',
          x: 1000,
          y: 1000,
          width: 320,
          height: 214,
          zIndex: 1,
          locked: false,
          collapsed: false,
        },
      ],
      translate: t,
    })

    const shotNodeIds = projection.nodes
      .filter((node) => node.data.kind === 'shot')
      .map((node) => node.id)

    expect(shotNodeIds).toEqual(['shot:panel-1', 'shot:panel-2'])
  })
})
