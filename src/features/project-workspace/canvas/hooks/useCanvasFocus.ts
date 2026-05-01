'use client'

import { useCallback } from 'react'
import type { ReactFlowInstance } from '@xyflow/react'
import {
  CANVAS_STAGE_COLLAPSED_HEIGHT,
} from '../stage-layout'
import type { CanvasStageId } from '../stageTypes'
import type { CanvasStageNode } from '../workspace-canvas-types'

interface UseCanvasFocusParams {
  readonly nodes: readonly CanvasStageNode[]
  readonly reactFlow: ReactFlowInstance<CanvasStageNode>
}

export function useCanvasFocus({ nodes, reactFlow }: UseCanvasFocusParams) {
  const focusStage = useCallback((stageId: CanvasStageId) => {
    const node = nodes.find((candidate) => candidate.data.stageId === stageId)
    if (!node) return
    const height = node.data.collapsed ? CANVAS_STAGE_COLLAPSED_HEIGHT : node.data.expandedHeight
    void reactFlow.setCenter(
      node.position.x + node.data.width / 2,
      node.position.y + height / 2,
      { zoom: 0.82, duration: 180 },
    )
  }, [nodes, reactFlow])

  const focusPanel = useCallback((panelId: string) => {
    void panelId
    focusStage('storyboard')
  }, [focusStage])

  const focusVideoPanel = useCallback((panelId: string) => {
    void panelId
    focusStage('video')
  }, [focusStage])

  return {
    focusStage,
    focusPanel,
    focusVideoPanel,
  }
}
