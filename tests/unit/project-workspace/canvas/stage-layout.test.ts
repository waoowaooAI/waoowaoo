import { describe, expect, it } from 'vitest'
import {
  buildDefaultCanvasStageLayouts,
  CANVAS_STAGE_COLLAPSED_HEIGHT,
  resolveCanvasStageLayouts,
} from '@/features/project-workspace/canvas/stage-layout'
import { CANVAS_STAGE_IDS } from '@/features/project-workspace/canvas/stageTypes'
import type { CanvasNodeLayout } from '@/lib/project-canvas/layout/canvas-layout.types'

describe('workspace canvas stage layout', () => {
  it('creates one deterministic top-level layout per workspace stage', () => {
    const layouts = buildDefaultCanvasStageLayouts('episode-1')

    expect(layouts.map((layout) => layout.stageId)).toEqual(CANVAS_STAGE_IDS)
    expect(layouts.map((layout) => layout.nodeKey)).toEqual([
      'workspace-stage:episode-1:story',
      'workspace-stage:episode-1:script',
      'workspace-stage:episode-1:storyboard',
      'workspace-stage:episode-1:video',
      'workspace-stage:episode-1:final',
    ])
    expect(layouts.every((layout) => layout.collapsed === false)).toBe(true)
  })

  it('merges saved positions without letting collapsed nodes keep expanded height', () => {
    const savedLayouts: CanvasNodeLayout[] = [{
      nodeKey: 'workspace-stage:episode-1:storyboard',
      x: 80,
      y: 120,
      width: 480,
      height: 700,
      zIndex: 7,
      locked: false,
      collapsed: true,
    }]

    const layouts = resolveCanvasStageLayouts({
      episodeId: 'episode-1',
      savedLayouts,
    })
    const storyboardLayout = layouts.find((layout) => layout.stageId === 'storyboard')

    expect(storyboardLayout).toMatchObject({
      x: 80,
      y: 120,
      width: 480,
      height: CANVAS_STAGE_COLLAPSED_HEIGHT,
      zIndex: 7,
      collapsed: true,
    })
  })
})
