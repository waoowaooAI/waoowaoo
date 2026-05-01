import type { ProjectCanvasGraph } from '@/lib/project-canvas/graph/canvas-graph.types'
import type { CanvasNodeLayout } from '@/lib/project-canvas/layout/canvas-layout.types'

export interface ProjectCanvasLayoutInput {
  readonly graph: ProjectCanvasGraph
}

export interface ProjectCanvasLayoutResult {
  readonly nodeLayouts: ReadonlyMap<string, CanvasNodeLayout>
}

export interface ProjectCanvasLayoutEngine {
  readonly id: 'rule-grid' | 'elk'
  layout(input: ProjectCanvasLayoutInput): Promise<ProjectCanvasLayoutResult>
}
