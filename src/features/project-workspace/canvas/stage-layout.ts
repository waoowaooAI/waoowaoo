import type { CanvasNodeLayout } from '@/lib/project-canvas/layout/canvas-layout.types'
import type { CanvasStageId } from './stageTypes'
import { CANVAS_STAGE_DEFINITIONS } from './stageTypes'

export const CANVAS_STAGE_WIDTH = 520
export const CANVAS_STAGE_HEIGHT = 620
export const CANVAS_STAGE_COLLAPSED_HEIGHT = 92

export interface CanvasStageLayout {
  readonly stageId: CanvasStageId
  readonly nodeKey: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly zIndex: number
  readonly collapsed: boolean
}

export function createCanvasStageNodeKey(episodeId: string, stageId: CanvasStageId): string {
  return `workspace-stage:${episodeId}:${stageId}`
}

export function buildDefaultCanvasStageLayouts(episodeId: string): CanvasStageLayout[] {
  return CANVAS_STAGE_DEFINITIONS.map((stage) => ({
    stageId: stage.id,
    nodeKey: createCanvasStageNodeKey(episodeId, stage.id),
    x: stage.order * (CANVAS_STAGE_WIDTH + 72),
    y: 0,
    width: CANVAS_STAGE_WIDTH,
    height: CANVAS_STAGE_HEIGHT,
    zIndex: stage.order,
    collapsed: false,
  }))
}

export function resolveCanvasStageLayouts(params: {
  readonly episodeId: string
  readonly savedLayouts: readonly CanvasNodeLayout[]
}): CanvasStageLayout[] {
  const defaultLayouts = buildDefaultCanvasStageLayouts(params.episodeId)
  const savedByNodeKey = new Map(params.savedLayouts.map((layout) => [layout.nodeKey, layout]))

  return defaultLayouts.map((defaultLayout) => {
    const savedLayout = savedByNodeKey.get(defaultLayout.nodeKey)
    if (!savedLayout) return defaultLayout

    const collapsed = savedLayout.collapsed
    return {
      ...defaultLayout,
      x: savedLayout.x,
      y: savedLayout.y,
      width: savedLayout.width,
      height: collapsed ? CANVAS_STAGE_COLLAPSED_HEIGHT : savedLayout.height,
      zIndex: savedLayout.zIndex,
      collapsed,
    }
  })
}
