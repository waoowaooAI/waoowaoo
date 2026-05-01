'use client'

import { useEffect, useState } from 'react'
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type NodeChange,
  useReactFlow,
} from '@xyflow/react'
import { useTranslations } from 'next-intl'
import type { ProjectClip, ProjectStoryboard } from '@/types/project'
import { useProjectCanvasRuntime } from './hooks/useProjectCanvasRuntime'
import { projectCanvasEdgeTypes } from './edges/edgeTypes'
import { projectCanvasNodeTypes } from './nodes/nodeTypes'
import type { ProjectCanvasFlowNode } from './flow-types'
import CanvasInspector from './components/CanvasInspector'
import { useCanvasLayoutPersistence } from './hooks/useCanvasLayoutPersistence'
import type { UpsertCanvasLayoutInput } from '@/lib/project-canvas/layout/canvas-layout-contract'
import type { CanvasNodeLayout } from '@/lib/project-canvas/layout/canvas-layout.types'

const EMPTY_SAVED_NODE_LAYOUTS: readonly CanvasNodeLayout[] = []

export interface ProjectCanvasProps {
  readonly projectId: string
  readonly episodeId: string
  readonly storyText: string | null
  readonly clips: readonly ProjectClip[]
  readonly storyboards: readonly ProjectStoryboard[]
}

function ProjectCanvasContent({
  projectId,
  episodeId,
  storyText,
  clips,
  storyboards,
}: ProjectCanvasProps) {
  const t = useTranslations('projectWorkflow.canvas')
  const [selectedNode, setSelectedNode] = useState<ProjectCanvasFlowNode | null>(null)
  const [nodes, setNodes] = useState<ProjectCanvasFlowNode[]>([])
  const reactFlow = useReactFlow<ProjectCanvasFlowNode>()
  const {
    layout,
    isLoading,
    saveLayout,
    isSaving,
  } = useCanvasLayoutPersistence({ projectId, episodeId })
  const { flowNodes, flowEdges } = useProjectCanvasRuntime({
    projectId,
    episodeId,
    storyText,
    clips,
    storyboards,
    savedNodeLayouts: layout?.nodeLayouts ?? EMPTY_SAVED_NODE_LAYOUTS,
  })

  useEffect(() => {
    setNodes(flowNodes)
  }, [flowNodes])

  useEffect(() => {
    if (!layout) return
    void reactFlow.setViewport(layout.viewport)
  }, [layout, reactFlow])

  const persistCurrentLayout = async (nextNodes: readonly ProjectCanvasFlowNode[]) => {
    const input: UpsertCanvasLayoutInput = {
      episodeId,
      viewport: reactFlow.getViewport(),
      nodeLayouts: nextNodes.map((node, index) => ({
        nodeKey: node.id,
        nodeType: node.data.nodeType,
        targetType: node.data.targetType as UpsertCanvasLayoutInput['nodeLayouts'][number]['targetType'],
        targetId: node.data.targetId,
        x: node.position.x,
        y: node.position.y,
        width: typeof node.width === 'number' && Number.isFinite(node.width) ? node.width : 320,
        height: typeof node.height === 'number' && Number.isFinite(node.height) ? node.height : 220,
        zIndex: typeof node.zIndex === 'number' ? node.zIndex : index,
        locked: false,
        collapsed: false,
      })),
    }
    await saveLayout(input)
  }

  const handleNodesChange = (changes: NodeChange<ProjectCanvasFlowNode>[]) => {
    setNodes((currentNodes) => applyNodeChanges(changes, currentNodes))
  }

  const handleNodeDragStop = async () => {
    await persistCurrentLayout(nodes)
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[620px] overflow-hidden rounded-lg border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-canvas)]">
      <div className="min-w-0 flex-1">
      <div className="flex h-12 items-center justify-between border-b border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-surface)] px-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--glass-text-primary)]">{t('title')}</h2>
          <p className="text-xs text-[var(--glass-text-tertiary)]">{t('subtitle')}</p>
        </div>
        <div className="text-xs text-[var(--glass-text-tertiary)]">
          {t('summary', { nodes: flowNodes.length, edges: flowEdges.length })}
          {isLoading ? ` · ${t('layout.loading')}` : ''}
          {isSaving ? ` · ${t('layout.saving')}` : ''}
        </div>
      </div>
      <div className="h-[calc(100%-3rem)]">
        <ReactFlow
          nodes={nodes}
          edges={flowEdges}
          nodeTypes={projectCanvasNodeTypes}
          edgeTypes={projectCanvasEdgeTypes}
          onNodesChange={handleNodesChange}
          onNodeClick={(_, node) => setSelectedNode(node)}
          onNodeDragStop={handleNodeDragStop}
          onMoveEnd={async () => persistCurrentLayout(nodes)}
          onPaneClick={() => setSelectedNode(null)}
          nodesDraggable
          nodesConnectable={false}
          edgesFocusable={false}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={1.5}
          onlyRenderVisibleElements
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
      </div>
      <CanvasInspector selectedNode={selectedNode} />
    </div>
  )
}

export default function ProjectCanvas(props: ProjectCanvasProps) {
  return (
    <ReactFlowProvider>
      <ProjectCanvasContent {...props} />
    </ReactFlowProvider>
  )
}
