'use client'

import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { ProjectClip, ProjectStoryboard } from '@/types/project'
import type { CanvasStageLayout } from '../stage-layout'
import { CANVAS_STAGE_COLLAPSED_HEIGHT } from '../stage-layout'
import { CANVAS_STAGE_DEFINITIONS } from '../stageTypes'
import type { CanvasStageNode } from '../workspace-canvas-types'

interface UseCanvasWorkspaceNodesParams {
  readonly storyText: string
  readonly clips: readonly ProjectClip[]
  readonly storyboards: readonly ProjectStoryboard[]
  readonly layouts: readonly CanvasStageLayout[]
  readonly translate: (key: string, values?: Record<string, string | number>) => string
}

function countPanels(storyboards: readonly ProjectStoryboard[]): number {
  return storyboards.reduce((total, storyboard) => total + (storyboard.panels?.length ?? 0), 0)
}

function countVideoPanels(storyboards: readonly ProjectStoryboard[]): number {
  return storyboards.reduce((total, storyboard) => {
    const panels = storyboard.panels ?? []
    return total + panels.filter((panel) => Boolean(panel.videoUrl || panel.videoTaskRunning)).length
  }, 0)
}

export function useCanvasWorkspaceNodes({
  storyText,
  clips,
  storyboards,
  layouts,
  translate,
}: UseCanvasWorkspaceNodesParams): CanvasStageNode[] {
  return useMemo(() => {
    const layoutByStageId = new Map(layouts.map((layout) => [layout.stageId, layout]))
    const panelCount = countPanels(storyboards)
    const videoCount = countVideoPanels(storyboards)

    return CANVAS_STAGE_DEFINITIONS.map((definition) => {
      const layout = layoutByStageId.get(definition.id)
      if (!layout) {
        throw new Error(`Missing workspace canvas stage layout for ${definition.id}`)
      }

      const nodeHeight = layout.collapsed ? CANVAS_STAGE_COLLAPSED_HEIGHT : layout.height
      const style = {
        width: layout.width,
        height: nodeHeight,
      } satisfies CSSProperties

      return {
        id: layout.nodeKey,
        type: 'canvasStage',
        position: { x: layout.x, y: layout.y },
        zIndex: layout.zIndex,
        draggable: true,
        selectable: true,
        style,
        data: {
          stageId: definition.id,
          title: translate(definition.titleKey),
          description: translate(definition.descriptionKey),
          summary: translate(`summaries.${definition.id}`, {
            storyChars: storyText.trim().length,
            clips: clips.length,
            storyboards: storyboards.length,
            panels: panelCount,
            videos: videoCount,
          }),
          statusLabel: translate(`status.${definition.id}`),
          collapsed: layout.collapsed,
          width: layout.width,
          expandedHeight: layout.height,
          layoutNodeType: definition.layoutNodeType,
          primaryAction: null,
        },
      } satisfies CanvasStageNode
    })
  }, [clips, layouts, storyText, storyboards, translate])
}
