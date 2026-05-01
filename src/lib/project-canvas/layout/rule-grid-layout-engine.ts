import type { ProjectCanvasGraph, ProjectCanvasNode } from '@/lib/project-canvas/graph/canvas-graph.types'
import type { CanvasNodeLayout } from '@/lib/project-canvas/layout/canvas-layout.types'
import type {
  ProjectCanvasLayoutEngine,
  ProjectCanvasLayoutInput,
  ProjectCanvasLayoutResult,
} from '@/lib/project-canvas/layout/layout-engine.types'

export interface RuleGridLayoutOptions {
  readonly columnsPerRow: number
  readonly nodeWidth: number
  readonly nodeHeight: number
  readonly columnGap: number
  readonly rowGap: number
  readonly laneGap: number
  readonly originX: number
  readonly originY: number
}

export const DEFAULT_RULE_GRID_LAYOUT_OPTIONS: RuleGridLayoutOptions = {
  columnsPerRow: 4,
  nodeWidth: 320,
  nodeHeight: 220,
  columnGap: 32,
  rowGap: 40,
  laneGap: 180,
  originX: 0,
  originY: 0,
}

const NODE_TYPE_ORDER: Record<ProjectCanvasNode['type'], number> = {
  story: 0,
  scriptClip: 1,
  storyboardGroup: 2,
  panelImage: 3,
  videoPanel: 4,
  timeline: 5,
}

function sortNodesForRuleGrid(nodes: readonly ProjectCanvasNode[]): ProjectCanvasNode[] {
  return [...nodes].sort((left, right) => {
    const typeDelta = NODE_TYPE_ORDER[left.type] - NODE_TYPE_ORDER[right.type]
    if (typeDelta !== 0) return typeDelta
    return left.id.localeCompare(right.id)
  })
}

function resolveLaneX(nodeType: ProjectCanvasNode['type'], options: RuleGridLayoutOptions): number {
  const laneIndex = NODE_TYPE_ORDER[nodeType]
  return options.originX + laneIndex * (options.nodeWidth + options.laneGap)
}

function resolveNodeY(indexInLane: number, options: RuleGridLayoutOptions): number {
  const rowIndex = Math.floor(indexInLane / options.columnsPerRow)
  const columnIndex = indexInLane % options.columnsPerRow
  return options.originY + rowIndex * (options.nodeHeight + options.rowGap) + columnIndex * 8
}

function createLayout(
  node: ProjectCanvasNode,
  indexInLane: number,
  options: RuleGridLayoutOptions,
  zIndex: number,
): CanvasNodeLayout {
  return {
    nodeKey: node.id,
    x: resolveLaneX(node.type, options),
    y: resolveNodeY(indexInLane, options),
    width: options.nodeWidth,
    height: options.nodeHeight,
    zIndex,
    locked: false,
    collapsed: false,
  }
}

export function buildRuleGridCanvasLayout(
  graph: ProjectCanvasGraph,
  options: RuleGridLayoutOptions = DEFAULT_RULE_GRID_LAYOUT_OPTIONS,
): Map<string, CanvasNodeLayout> {
  if (options.columnsPerRow <= 0) {
    throw new Error('columnsPerRow must be greater than 0')
  }

  const laneCounts = new Map<ProjectCanvasNode['type'], number>()
  const layouts = new Map<string, CanvasNodeLayout>()

  sortNodesForRuleGrid(graph.nodes).forEach((node, index) => {
    const nextLaneIndex = laneCounts.get(node.type) ?? 0
    laneCounts.set(node.type, nextLaneIndex + 1)
    layouts.set(node.id, createLayout(node, nextLaneIndex, options, index))
  })

  return layouts
}

export class RuleGridLayoutEngine implements ProjectCanvasLayoutEngine {
  readonly id = 'rule-grid' as const

  constructor(private readonly options: RuleGridLayoutOptions = DEFAULT_RULE_GRID_LAYOUT_OPTIONS) {}

  async layout(input: ProjectCanvasLayoutInput): Promise<ProjectCanvasLayoutResult> {
    return {
      nodeLayouts: buildRuleGridCanvasLayout(input.graph, this.options),
    }
  }
}
