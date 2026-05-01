import type { Edge, Node } from '@xyflow/react'
import type { CanvasLayoutNodeType } from '@/lib/project-canvas/layout/canvas-layout-contract'

export type WorkspaceCanvasNodeKind =
  | 'storyInput'
  | 'analysis'
  | 'scriptClip'
  | 'shot'
  | 'imageAsset'
  | 'videoClip'
  | 'finalTimeline'

export type WorkspaceCanvasTargetType = 'episode' | 'clip' | 'panel'

export type WorkspaceCanvasNodeAction =
  | { readonly type: 'update_story'; readonly value: string }
  | { readonly type: 'generate_script' }
  | { readonly type: 'generate_storyboard' }
  | { readonly type: 'generate_image'; readonly panelId: string }
  | {
      readonly type: 'generate_video'
      readonly storyboardId: string
      readonly panelIndex: number
      readonly panelId: string
    }
  | { readonly type: 'generate_all_videos' }

export type WorkspaceCanvasNodeActionHandler = (action: WorkspaceCanvasNodeAction) => void

export interface WorkspaceCanvasNodeData extends Record<string, unknown> {
  readonly kind: WorkspaceCanvasNodeKind
  readonly layoutNodeType: CanvasLayoutNodeType
  readonly targetType: WorkspaceCanvasTargetType
  readonly targetId: string
  readonly title: string
  readonly eyebrow: string
  readonly body: string
  readonly meta: string
  readonly statusLabel: string
  readonly width: number
  readonly height: number
  readonly actionLabel?: string
  readonly action?: WorkspaceCanvasNodeAction
  readonly onAction?: WorkspaceCanvasNodeActionHandler
  readonly indexLabel?: string
  readonly previewImageUrl?: string | null
}

export type WorkspaceCanvasFlowNode = Node<WorkspaceCanvasNodeData, 'workspaceNode'>
export type WorkspaceCanvasFlowEdge = Edge

export interface WorkspaceCanvasProjection {
  readonly nodes: readonly WorkspaceCanvasFlowNode[]
  readonly edges: readonly WorkspaceCanvasFlowEdge[]
}
