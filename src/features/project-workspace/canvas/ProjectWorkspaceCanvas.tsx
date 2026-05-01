'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { useCanvasLayoutPersistence } from '@/features/project-canvas/hooks/useCanvasLayoutPersistence'
import type { UpsertCanvasLayoutInput } from '@/lib/project-canvas/layout/canvas-layout-contract'
import type { CanvasNodeLayout } from '@/lib/project-canvas/layout/canvas-layout.types'
import {
  executeCanvasCommand,
  type CanvasCommandHandlers,
} from '@/lib/project-canvas/commands/canvas-command-registry'
import { useWorkspaceEpisodeStageData } from '../hooks/useWorkspaceEpisodeStageData'
import { useWorkspaceProvider } from '../WorkspaceProvider'
import { useWorkspaceStageRuntime } from '../WorkspaceStageRuntimeContext'
import CanvasToolbar from './CanvasToolbar'
import {
  buildDefaultCanvasStageLayouts,
  CANVAS_STAGE_COLLAPSED_HEIGHT,
  resolveCanvasStageLayouts,
} from './stage-layout'
import { CANVAS_STAGE_DEFINITIONS } from './stageTypes'
import { useCanvasWorkspaceNodes } from './hooks/useCanvasWorkspaceNodes'
import { useCanvasFocus } from './hooks/useCanvasFocus'
import { workspaceCanvasStageNodeTypes } from './stages/stageNodeTypes'
import type { CanvasStageNode } from './workspace-canvas-types'

const DEFAULT_VIEWPORT = { x: 48, y: 96, zoom: 0.82 }
const EMPTY_SAVED_NODE_LAYOUTS: readonly CanvasNodeLayout[] = []

function throwUnsupportedCanvasCommand(command: string): never {
  throw new Error(`Canvas command "${command}" is not wired to a workspace operation yet`)
}

function ProjectWorkspaceCanvasContent() {
  const t = useTranslations('projectWorkflow.canvas.workspace')
  const { projectId, episodeId } = useWorkspaceProvider()
  const { novelText, clips, storyboards } = useWorkspaceEpisodeStageData()
  const runtime = useWorkspaceStageRuntime()
  const reactFlow = useReactFlow<CanvasStageNode>()
  const [nodes, setNodes] = useState<CanvasStageNode[]>([])

  const {
    layout,
    isLoading,
    saveLayout,
    isSaving,
    loadError,
    saveError,
    layoutWarningCode,
    resetLayout: resetSavedLayout,
  } = useCanvasLayoutPersistence({
    projectId,
    episodeId: episodeId ?? '',
  })

  const stageLayouts = useMemo(() => resolveCanvasStageLayouts({
    episodeId: episodeId ?? 'pending-episode',
    savedLayouts: layout?.nodeLayouts ?? EMPTY_SAVED_NODE_LAYOUTS,
  }), [episodeId, layout])

  const flowNodes = useCanvasWorkspaceNodes({
    storyText: novelText,
    clips,
    storyboards,
    layouts: stageLayouts,
    translate: t,
  })
  const canvasFocus = useCanvasFocus({ nodes, reactFlow })

  useEffect(() => {
    setNodes(flowNodes)
  }, [flowNodes])

  useEffect(() => {
    if (!layout) return
    void reactFlow.setViewport(layout.viewport)
  }, [layout, reactFlow])

  const persistCurrentLayout = useCallback(async (nextNodes: readonly CanvasStageNode[]) => {
    if (!episodeId) return

    const input: UpsertCanvasLayoutInput = {
      episodeId,
      viewport: reactFlow.getViewport(),
      nodeLayouts: nextNodes.map((node, index) => ({
        nodeKey: node.id,
        nodeType: node.data.layoutNodeType,
        targetType: 'episode',
        targetId: episodeId,
        x: node.position.x,
        y: node.position.y,
        width: node.data.width,
        height: node.data.collapsed ? CANVAS_STAGE_COLLAPSED_HEIGHT : node.data.expandedHeight,
        zIndex: typeof node.zIndex === 'number' ? node.zIndex : index,
        locked: false,
        collapsed: node.data.collapsed,
      })),
    }

    await saveLayout(input)
  }, [episodeId, reactFlow, saveLayout])

  const handleNodesChange = useCallback((changes: NodeChange<CanvasStageNode>[]) => {
    setNodes((currentNodes) => applyNodeChanges(changes, currentNodes))
  }, [])

  const setAllCollapsed = useCallback((collapsed: boolean) => {
    setNodes((currentNodes) => {
      const nextNodes = currentNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          collapsed,
        },
        style: {
          ...node.style,
          height: collapsed ? CANVAS_STAGE_COLLAPSED_HEIGHT : node.data.expandedHeight,
        },
      }))
      void persistCurrentLayout(nextNodes)
      return nextNodes
    })
  }, [persistCurrentLayout])

  const resetLayout = useCallback(() => {
    if (!episodeId) return
    const defaultLayouts = buildDefaultCanvasStageLayouts(episodeId)
    const layoutByStageId = new Map(defaultLayouts.map((stageLayout) => [stageLayout.stageId, stageLayout]))
    setNodes((currentNodes) => {
      const nextNodes = currentNodes.map((node) => {
        const layout = layoutByStageId.get(node.data.stageId)
        if (!layout) return node
        return {
          ...node,
          position: { x: layout.x, y: layout.y },
          zIndex: layout.zIndex,
          data: {
            ...node.data,
            collapsed: false,
            width: layout.width,
            expandedHeight: layout.height,
          },
          style: {
            ...node.style,
            width: layout.width,
            height: layout.height,
          },
        }
      })
      return nextNodes
    })
    void reactFlow.setViewport(DEFAULT_VIEWPORT)
    void resetSavedLayout()
  }, [episodeId, reactFlow, resetSavedLayout])

  const fitView = useCallback(() => {
    void reactFlow.fitView({ padding: 0.14, duration: 180 })
  }, [reactFlow])

  const commandHandlers = useMemo<CanvasCommandHandlers>(() => ({
    focusStage: canvasFocus.focusStage,
    insertPanelAfter: () => throwUnsupportedCanvasCommand('insert_panel_after'),
    deletePanel: () => throwUnsupportedCanvasCommand('delete_panel'),
    reorderPanel: () => throwUnsupportedCanvasCommand('reorder_panel'),
    generatePanelImage: () => throwUnsupportedCanvasCommand('generate_panel_image'),
    regeneratePanelImage: () => throwUnsupportedCanvasCommand('regenerate_panel_image'),
    generatePanelVideo: (input) => runtime.onGenerateVideo(
      input.storyboardId,
      input.panelIndex,
      undefined,
      undefined,
      undefined,
      input.panelId,
    ),
    generateAllVideos: () => runtime.onGenerateAllVideos(),
    exportFinalVideo: () => throwUnsupportedCanvasCommand('export_final_video'),
  }), [canvasFocus.focusStage, runtime])

  const runCanvasCommand = useCallback((command: Parameters<typeof executeCanvasCommand>[0]) => {
    void executeCanvasCommand(command, commandHandlers)
  }, [commandHandlers])

  const errorLabel = loadError || saveError || layoutWarningCode ? t('layoutWarning') : null
  const nodeCountSummary = t('summary', {
    stages: CANVAS_STAGE_DEFINITIONS.length,
    clips: clips.length,
    storyboards: storyboards.length,
  })
  const focusItems = CANVAS_STAGE_DEFINITIONS.map((definition) => ({
    id: definition.id,
    label: t(`focus.${definition.id}`),
  }))

  if (!episodeId) return null

  return (
    <div className="h-[calc(100vh-8rem)] min-h-[640px] overflow-hidden rounded-lg border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-canvas)]">
      <CanvasToolbar
        title={t('title')}
        subtitle={t('subtitle')}
        summary={nodeCountSummary}
        resetLabel={t('toolbar.resetLayout')}
        collapseAllLabel={t('toolbar.collapseAll')}
        expandAllLabel={t('toolbar.expandAll')}
        fitViewLabel={t('toolbar.fitView')}
        loadingLabel={t('layoutLoading')}
        savingLabel={t('layoutSaving')}
        errorLabel={errorLabel}
        focusItems={focusItems}
        isLoading={isLoading}
        isSaving={isSaving}
        onResetLayout={resetLayout}
        onCollapseAll={() => setAllCollapsed(true)}
        onExpandAll={() => setAllCollapsed(false)}
        onFitView={fitView}
        onFocusStage={(stageId) => runCanvasCommand({ type: 'focus_stage', stageId })}
      />

      <div className="h-[calc(100%-3.5rem)]">
        <ReactFlow
          nodes={nodes}
          edges={[]}
          nodeTypes={workspaceCanvasStageNodeTypes}
          onNodesChange={handleNodesChange}
          onNodeDragStop={async () => persistCurrentLayout(nodes)}
          onMoveEnd={async () => persistCurrentLayout(nodes)}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
          fitView
          fitViewOptions={{ padding: 0.14 }}
          minZoom={0.25}
          maxZoom={1.25}
          defaultViewport={DEFAULT_VIEWPORT}
          onlyRenderVisibleElements
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
    </div>
  )
}

export default function ProjectWorkspaceCanvas() {
  return (
    <ReactFlowProvider>
      <ProjectWorkspaceCanvasContent />
    </ReactFlowProvider>
  )
}
