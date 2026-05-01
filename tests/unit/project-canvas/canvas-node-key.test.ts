import { describe, expect, it } from 'vitest'
import {
  createPanelImageNodeKey,
  createScriptClipNodeKey,
  createStoryboardGroupNodeKey,
  createStoryNodeKey,
  createTimelineNodeKey,
  createVideoPanelNodeKey,
} from '@/lib/project-canvas/graph/canvas-node-key'

describe('canvas node key', () => {
  it('creates stable node keys for every project canvas target type', () => {
    expect(createStoryNodeKey('project-1')).toBe('story:project-1')
    expect(createScriptClipNodeKey('clip-1')).toBe('scriptClip:clip-1')
    expect(createStoryboardGroupNodeKey('storyboard-1')).toBe('storyboardGroup:storyboard-1')
    expect(createPanelImageNodeKey('panel-1')).toBe('panelImage:panel-1')
    expect(createVideoPanelNodeKey('panel-1')).toBe('videoPanel:panel-1')
    expect(createTimelineNodeKey('episode-1')).toBe('timeline:episode-1')
  })
})
