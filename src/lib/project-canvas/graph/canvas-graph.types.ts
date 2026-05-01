export type ProjectCanvasNodeType =
  | 'story'
  | 'scriptClip'
  | 'storyboardGroup'
  | 'panelImage'
  | 'videoPanel'
  | 'timeline'

export type ProjectCanvasEdgeType =
  | 'sequence'
  | 'dependsOn'
  | 'generates'
  | 'references'
  | 'voiceBinding'
  | 'timelinePlacement'

export type ProjectCanvasNodeStatus = 'idle' | 'queued' | 'processing' | 'failed' | 'ready'

export interface ProjectCanvasNodeData extends Record<string, unknown> {
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

export interface ProjectCanvasNode {
  readonly id: string
  readonly type: ProjectCanvasNodeType
  readonly data: ProjectCanvasNodeData
}

export interface ProjectCanvasEdge {
  readonly id: string
  readonly type: ProjectCanvasEdgeType
  readonly source: string
  readonly target: string
}

export interface ProjectCanvasGraph {
  readonly nodes: readonly ProjectCanvasNode[]
  readonly edges: readonly ProjectCanvasEdge[]
}
