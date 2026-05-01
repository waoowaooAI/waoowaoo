import type { ProjectClip, ProjectPanel, ProjectStoryboard } from '@/types/project'
import type {
  ProjectCanvasEdge,
  ProjectCanvasGraph,
  ProjectCanvasNode,
  ProjectCanvasNodeStatus,
} from '@/lib/project-canvas/graph/canvas-graph.types'
import {
  createPanelImageNodeKey,
  createScriptClipNodeKey,
  createStoryboardGroupNodeKey,
  createStoryNodeKey,
  createTimelineNodeKey,
  createVideoPanelNodeKey,
} from '@/lib/project-canvas/graph/canvas-node-key'

export interface BuildProjectCanvasGraphInput {
  readonly projectId: string
  readonly episodeId: string
  readonly storyText: string | null
  readonly clips: readonly ProjectClip[]
  readonly storyboards: readonly ProjectStoryboard[]
}

function createNode(params: {
  readonly id: string
  readonly type: ProjectCanvasNode['type']
  readonly targetId: string
  readonly targetType: string
  readonly title: string
  readonly status: ProjectCanvasNodeStatus
  readonly orderIndex?: number
  readonly panelIndex?: number
  readonly panelNumber?: number | null
  readonly previewImageUrl?: string | null
  readonly description?: string | null
}): ProjectCanvasNode {
  return {
    id: params.id,
    type: params.type,
    data: {
      nodeKey: params.id,
      nodeType: params.type,
      targetId: params.targetId,
      targetType: params.targetType,
      title: params.title,
      status: params.status,
      orderIndex: params.orderIndex,
      panelIndex: params.panelIndex,
      panelNumber: params.panelNumber,
      previewImageUrl: params.previewImageUrl,
      description: params.description,
    },
  }
}

function createEdge(params: {
  readonly id: string
  readonly type: ProjectCanvasEdge['type']
  readonly source: string
  readonly target: string
}): ProjectCanvasEdge {
  return params
}

function getStoryboardPanels(storyboard: ProjectStoryboard): ProjectPanel[] {
  return Array.isArray(storyboard.panels) ? [...storyboard.panels] : []
}

function sortPanelsByIndex(panels: readonly ProjectPanel[]): ProjectPanel[] {
  return [...panels].sort((left, right) => left.panelIndex - right.panelIndex)
}

function resolvePanelStatus(panel: ProjectPanel): ProjectCanvasNodeStatus {
  if (panel.imageErrorMessage) return 'failed'
  if (panel.imageTaskRunning) return 'processing'
  if (panel.imageUrl) return 'ready'
  return 'idle'
}

function panelHasVideoNode(panel: ProjectPanel): boolean {
  return Boolean(panel.videoUrl || panel.videoTaskRunning || panel.videoPrompt || panel.firstLastFramePrompt)
}

function resolveVideoStatus(panel: ProjectPanel): ProjectCanvasNodeStatus {
  if (panel.videoTaskRunning) return 'processing'
  if (panel.videoUrl) return 'ready'
  return 'idle'
}

export function buildProjectCanvasGraph(input: BuildProjectCanvasGraphInput): ProjectCanvasGraph {
  const nodes: ProjectCanvasNode[] = []
  const edges: ProjectCanvasEdge[] = []
  const storyNodeKey = createStoryNodeKey(input.projectId)
  const timelineNodeKey = createTimelineNodeKey(input.episodeId)

  nodes.push(createNode({
    id: storyNodeKey,
    type: 'story',
    targetId: input.projectId,
    targetType: 'project',
    title: 'story',
    status: input.storyText?.trim() ? 'ready' : 'idle',
    description: input.storyText,
  }))

  input.clips.forEach((clip, clipIndex) => {
    const clipNodeKey = createScriptClipNodeKey(clip.id)
    nodes.push(createNode({
      id: clipNodeKey,
      type: 'scriptClip',
      targetId: clip.id,
      targetType: 'clip',
      title: 'scriptClip',
      status: clip.screenplay || clip.content ? 'ready' : 'idle',
      orderIndex: clipIndex + 1,
      description: clip.summary || clip.content,
    }))

    edges.push(createEdge({
      id: `edge:${storyNodeKey}->${clipNodeKey}`,
      type: 'generates',
      source: storyNodeKey,
      target: clipNodeKey,
    }))
  })

  const clipIndexById = new Map(input.clips.map((clip, index) => [clip.id, index]))
  const sortedStoryboards = [...input.storyboards].sort((left, right) => {
    const leftIndex = clipIndexById.get(left.clipId) ?? Number.MAX_SAFE_INTEGER
    const rightIndex = clipIndexById.get(right.clipId) ?? Number.MAX_SAFE_INTEGER
    return leftIndex - rightIndex
  })

  sortedStoryboards.forEach((storyboard) => {
    const storyboardNodeKey = createStoryboardGroupNodeKey(storyboard.id)
    const clipNodeKey = createScriptClipNodeKey(storyboard.clipId)

    nodes.push(createNode({
      id: storyboardNodeKey,
      type: 'storyboardGroup',
      targetId: storyboard.id,
      targetType: 'storyboard',
      title: 'storyboardGroup',
      status: storyboard.lastError ? 'failed' : getStoryboardPanels(storyboard).length > 0 ? 'ready' : 'idle',
      orderIndex: (clipIndexById.get(storyboard.clipId) ?? 0) + 1,
    }))

    edges.push(createEdge({
      id: `edge:${clipNodeKey}->${storyboardNodeKey}`,
      type: 'generates',
      source: clipNodeKey,
      target: storyboardNodeKey,
    }))

    const panels = sortPanelsByIndex(getStoryboardPanels(storyboard))
    panels.forEach((panel, panelOrder) => {
      const panelNodeKey = createPanelImageNodeKey(panel.id)

      nodes.push(createNode({
        id: panelNodeKey,
        type: 'panelImage',
        targetId: panel.id,
        targetType: 'panel',
        title: 'panelImage',
        status: resolvePanelStatus(panel),
        panelIndex: panel.panelIndex,
        panelNumber: panel.panelNumber,
        previewImageUrl: panel.imageUrl,
        description: panel.description,
      }))

      if (panelOrder === 0) {
        edges.push(createEdge({
          id: `edge:${storyboardNodeKey}->${panelNodeKey}`,
          type: 'dependsOn',
          source: storyboardNodeKey,
          target: panelNodeKey,
        }))
      } else {
        const previousPanel = panels[panelOrder - 1]
        const previousPanelNodeKey = createPanelImageNodeKey(previousPanel.id)
        edges.push(createEdge({
          id: `edge:${previousPanelNodeKey}->${panelNodeKey}`,
          type: 'sequence',
          source: previousPanelNodeKey,
          target: panelNodeKey,
        }))
      }

      if (panelHasVideoNode(panel)) {
        const videoNodeKey = createVideoPanelNodeKey(panel.id)
        nodes.push(createNode({
          id: videoNodeKey,
          type: 'videoPanel',
          targetId: panel.id,
          targetType: 'panel',
          title: 'videoPanel',
          status: resolveVideoStatus(panel),
          panelIndex: panel.panelIndex,
          panelNumber: panel.panelNumber,
          previewImageUrl: panel.videoUrl,
          description: panel.videoPrompt,
        }))

        edges.push(createEdge({
          id: `edge:${panelNodeKey}->${videoNodeKey}`,
          type: 'dependsOn',
          source: panelNodeKey,
          target: videoNodeKey,
        }))

        edges.push(createEdge({
          id: `edge:${videoNodeKey}->${timelineNodeKey}`,
          type: 'timelinePlacement',
          source: videoNodeKey,
          target: timelineNodeKey,
        }))
      }
    })
  })

  nodes.push(createNode({
    id: timelineNodeKey,
    type: 'timeline',
    targetId: input.episodeId,
    targetType: 'episode',
    title: 'timeline',
    status: 'idle',
  }))

  return { nodes, edges }
}
