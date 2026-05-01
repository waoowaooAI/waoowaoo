import type { Edge, Node } from '@xyflow/react'
import type {
  ProjectCanvasEdgeType,
  ProjectCanvasNodeStatus,
  ProjectCanvasNodeType,
} from '@/lib/project-canvas/graph/canvas-graph.types'

export interface ProjectCanvasFlowNodeData extends Record<string, unknown> {
  readonly nodeKey: string
  readonly nodeType: ProjectCanvasNodeType
  readonly targetId: string
  readonly targetType: string
  readonly title: string
  readonly status: ProjectCanvasNodeStatus
  readonly orderIndex?: number
  readonly panelIndex?: number
  readonly panelNumber?: number | null
  readonly previewImageUrl?: string | null
  readonly description?: string | null
}

export interface ProjectCanvasFlowEdgeData extends Record<string, unknown> {
  readonly edgeType: ProjectCanvasEdgeType
}

export type ProjectCanvasFlowNode = Node<ProjectCanvasFlowNodeData, ProjectCanvasNodeType>
export type ProjectCanvasFlowEdge = Edge<ProjectCanvasFlowEdgeData, ProjectCanvasEdgeType>
