import type { Node } from '@xyflow/react'
import type { CanvasNodeLayoutInput } from '@/lib/project-canvas/layout/canvas-layout-contract'
import type { CanvasStageId } from './stageTypes'

export interface CanvasStageAction {
  readonly label: string
  readonly disabled: boolean
  readonly busy: boolean
  readonly run: () => Promise<void>
}

export interface CanvasStageNodeData extends Record<string, unknown> {
  readonly stageId: CanvasStageId
  readonly title: string
  readonly description: string
  readonly summary: string
  readonly statusLabel: string
  readonly collapsed: boolean
  readonly width: number
  readonly expandedHeight: number
  readonly layoutNodeType: CanvasNodeLayoutInput['nodeType']
  readonly primaryAction: CanvasStageAction | null
}

export type CanvasStageNode = Node<CanvasStageNodeData, 'canvasStage'>
