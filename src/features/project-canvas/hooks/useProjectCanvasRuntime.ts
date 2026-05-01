'use client'

import { useMemo } from 'react'
import type { ProjectClip, ProjectStoryboard } from '@/types/project'
import { buildProjectCanvasGraph } from '@/lib/project-canvas/graph/build-project-canvas-graph'
import { buildRuleGridCanvasLayout } from '@/lib/project-canvas/layout/rule-grid-layout-engine'
import type { ProjectCanvasFlowEdge, ProjectCanvasFlowNode } from '../flow-types'
import type { CanvasNodeLayout } from '@/lib/project-canvas/layout/canvas-layout.types'
import { resolveCanvasNodeLayouts } from '@/lib/project-canvas/layout/resolve-canvas-layout'

interface UseProjectCanvasRuntimeParams {
  readonly projectId: string
  readonly episodeId: string
  readonly storyText: string | null
  readonly clips: readonly ProjectClip[]
  readonly storyboards: readonly ProjectStoryboard[]
  readonly savedNodeLayouts?: readonly CanvasNodeLayout[]
}

export function useProjectCanvasRuntime({
  projectId,
  episodeId,
  storyText,
  clips,
  storyboards,
  savedNodeLayouts = [],
}: UseProjectCanvasRuntimeParams) {
  const graph = useMemo(() => buildProjectCanvasGraph({
    projectId,
    episodeId,
    storyText,
    clips,
    storyboards,
  }), [clips, episodeId, projectId, storyText, storyboards])

  const flowNodes = useMemo<ProjectCanvasFlowNode[]>(() => {
    const layouts = resolveCanvasNodeLayouts({
      autoLayouts: buildRuleGridCanvasLayout(graph),
      savedLayouts: savedNodeLayouts,
    })
    return graph.nodes.map((node) => {
      const layout = layouts.get(node.id)
      if (!layout) {
        throw new Error(`Missing canvas layout for node ${node.id}`)
      }

      return {
        id: node.id,
        type: node.type,
        position: { x: layout.x, y: layout.y },
        width: layout.width,
        height: layout.height,
        data: {
          nodeKey: node.data.nodeKey,
          nodeType: node.data.nodeType,
          targetId: node.data.targetId,
          targetType: node.data.targetType,
          title: node.data.title,
          status: node.data.status,
          orderIndex: node.data.orderIndex,
          panelIndex: node.data.panelIndex,
          panelNumber: node.data.panelNumber,
          previewImageUrl: node.data.previewImageUrl,
          description: node.data.description,
        },
        draggable: false,
        selectable: true,
      }
    })
  }, [graph, savedNodeLayouts])

  const flowEdges = useMemo<ProjectCanvasFlowEdge[]>(() => {
    return graph.edges.map((edge) => ({
      id: edge.id,
      type: edge.type,
      source: edge.source,
      target: edge.target,
      data: { edgeType: edge.type },
      animated: edge.type === 'dependsOn' || edge.type === 'generates',
    }))
  }, [graph])

  return {
    graph,
    flowNodes,
    flowEdges,
  }
}
