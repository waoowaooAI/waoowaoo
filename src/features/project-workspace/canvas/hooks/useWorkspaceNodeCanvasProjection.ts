'use client'

import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { CanvasNodeLayout } from '@/lib/project-canvas/layout/canvas-layout.types'
import type { ProjectClip, ProjectPanel, ProjectStoryboard } from '@/types/project'
import type {
  WorkspaceCanvasFlowEdge,
  WorkspaceCanvasFlowNode,
  WorkspaceCanvasNodeActionHandler,
  WorkspaceCanvasNodeData,
  WorkspaceCanvasProjection,
} from '../node-canvas-types'

const STORY_NODE_WIDTH = 360
const DEFAULT_NODE_WIDTH = 320
const MEDIA_NODE_WIDTH = 300
const FINAL_NODE_WIDTH = 340
const DEFAULT_NODE_HEIGHT = 214
const MEDIA_NODE_HEIGHT = 234
const STORY_NODE_HEIGHT = 260
const COLUMN_GAP = 430
const ROW_GAP = 248

interface TranslateValues {
  readonly [key: string]: string | number
}

type Translate = (key: string, values?: TranslateValues) => string

export interface BuildWorkspaceNodeCanvasProjectionInput {
  readonly episodeId: string
  readonly storyText: string
  readonly clips: readonly ProjectClip[]
  readonly storyboards: readonly ProjectStoryboard[]
  readonly savedLayouts: readonly CanvasNodeLayout[]
  readonly translate: Translate
  readonly onAction?: WorkspaceCanvasNodeActionHandler
}

function compactText(value: string | null | undefined, fallback: string): string {
  const text = value?.trim()
  if (!text) return fallback
  return text.length > 220 ? `${text.slice(0, 220)}...` : text
}

function sortPanels(panels: readonly ProjectPanel[]): ProjectPanel[] {
  return [...panels].sort((a, b) => {
    const aNumber = a.panelNumber ?? a.panelIndex
    const bNumber = b.panelNumber ?? b.panelIndex
    return aNumber - bNumber
  })
}

function sortedStoryboards(storyboards: readonly ProjectStoryboard[], clipOrder: ReadonlyMap<string, number>): ProjectStoryboard[] {
  return [...storyboards].sort((a, b) => {
    const aOrder = clipOrder.get(a.clipId) ?? Number.MAX_SAFE_INTEGER
    const bOrder = clipOrder.get(b.clipId) ?? Number.MAX_SAFE_INTEGER
    if (aOrder !== bOrder) return aOrder - bOrder
    return a.id.localeCompare(b.id)
  })
}

function layoutStyle(width: number, height: number): CSSProperties {
  return { width, height }
}

function resolvePosition(params: {
  readonly nodeKey: string
  readonly fallbackX: number
  readonly fallbackY: number
  readonly savedLayoutByKey: ReadonlyMap<string, CanvasNodeLayout>
}): { readonly x: number; readonly y: number } {
  const saved = params.savedLayoutByKey.get(params.nodeKey)
  if (!saved) return { x: params.fallbackX, y: params.fallbackY }
  return { x: saved.x, y: saved.y }
}

function createNode(params: {
  readonly id: string
  readonly fallbackX: number
  readonly fallbackY: number
  readonly zIndex: number
  readonly data: WorkspaceCanvasNodeData
  readonly savedLayoutByKey: ReadonlyMap<string, CanvasNodeLayout>
}): WorkspaceCanvasFlowNode {
  const position = resolvePosition({
    nodeKey: params.id,
    fallbackX: params.fallbackX,
    fallbackY: params.fallbackY,
    savedLayoutByKey: params.savedLayoutByKey,
  })

  return {
    id: params.id,
    type: 'workspaceNode',
    position,
    zIndex: params.zIndex,
    draggable: true,
    selectable: true,
    style: layoutStyle(params.data.width, params.data.height),
    data: params.data,
  }
}

function createEdge(id: string, source: string, target: string): WorkspaceCanvasFlowEdge {
  return {
    id,
    source,
    target,
    type: 'smoothstep',
    animated: false,
    style: {
      stroke: '#64748b',
      strokeWidth: 1.5,
    },
  }
}

function hasImage(panel: ProjectPanel): boolean {
  return Boolean(panel.imageUrl || panel.media?.url || panel.imageTaskRunning)
}

function hasVideo(panel: ProjectPanel): boolean {
  return Boolean(panel.videoUrl || panel.videoMedia?.url || panel.videoTaskRunning)
}

function panelDisplayNumber(panel: ProjectPanel): string {
  return String(panel.panelNumber ?? panel.panelIndex + 1).padStart(2, '0')
}

export function buildWorkspaceNodeCanvasProjection({
  episodeId,
  storyText,
  clips,
  storyboards,
  savedLayouts,
  translate,
  onAction,
}: BuildWorkspaceNodeCanvasProjectionInput): WorkspaceCanvasProjection {
  const savedLayoutByKey = new Map(savedLayouts.map((layout) => [layout.nodeKey, layout]))
  const nodes: WorkspaceCanvasFlowNode[] = []
  const edges: WorkspaceCanvasFlowEdge[] = []
  let zIndex = 0

  const storyBody = storyText.trim()
  const storyNodeId = `story:${episodeId}`
  nodes.push(createNode({
    id: storyNodeId,
    fallbackX: 40,
    fallbackY: 260,
    zIndex: zIndex++,
    savedLayoutByKey,
    data: {
      kind: 'storyInput',
      layoutNodeType: 'story',
      targetType: 'episode',
      targetId: episodeId,
      title: translate('nodes.story.title'),
      eyebrow: translate('nodes.story.eyebrow'),
      body: storyBody,
      meta: translate('nodes.story.meta', { chars: storyBody.length }),
      statusLabel: storyBody ? translate('status.ready') : translate('status.empty'),
      width: STORY_NODE_WIDTH,
      height: STORY_NODE_HEIGHT,
      actionLabel: storyBody ? translate('actions.generateScript') : undefined,
      action: storyBody ? { type: 'generate_script' } : undefined,
      onAction,
    },
  }))

  const hasStory = storyBody.length > 0
  const analysisNodeId = `analysis:${episodeId}`
  if (hasStory) {
    nodes.push(createNode({
      id: analysisNodeId,
      fallbackX: 40 + COLUMN_GAP,
      fallbackY: 260,
      zIndex: zIndex++,
      savedLayoutByKey,
      data: {
        kind: 'analysis',
        layoutNodeType: 'analysis',
        targetType: 'episode',
        targetId: episodeId,
        title: translate('nodes.analysis.title'),
        eyebrow: translate('nodes.analysis.eyebrow'),
        body: translate('nodes.analysis.body', {
          clips: clips.length,
          storyboards: storyboards.length,
          panels: storyboards.reduce((total, storyboard) => total + (storyboard.panels?.length ?? 0), 0),
        }),
        meta: translate('nodes.analysis.meta'),
        statusLabel: translate('status.ready'),
        width: DEFAULT_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
        onAction,
      },
    }))
    edges.push(createEdge('edge:story-analysis', storyNodeId, analysisNodeId))
  }

  const clipOrder = new Map(clips.map((clip, index) => [clip.id, index]))
  const clipNodeIds = new Map<string, string>()
  clips.forEach((clip, index) => {
    const nodeId = `clip:${clip.id}`
    clipNodeIds.set(clip.id, nodeId)
    nodes.push(createNode({
      id: nodeId,
      fallbackX: 40 + COLUMN_GAP * 2,
      fallbackY: 80 + index * ROW_GAP,
      zIndex: zIndex++,
      savedLayoutByKey,
      data: {
        kind: 'scriptClip',
        layoutNodeType: 'scriptClip',
        targetType: 'clip',
        targetId: clip.id,
        title: clip.summary || translate('nodes.clip.title', { index: index + 1 }),
        eyebrow: translate('nodes.clip.eyebrow'),
        body: compactText(clip.content || clip.screenplay || clip.summary, translate('empty.clip')),
        meta: translate('nodes.clip.meta', { index: index + 1 }),
        statusLabel: translate('status.ready'),
        width: DEFAULT_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
        indexLabel: `C${index + 1}`,
        actionLabel: translate('actions.generateStoryboard'),
        action: { type: 'generate_storyboard' },
        onAction,
      },
    }))
    edges.push(createEdge(`edge:analysis-clip:${clip.id}`, hasStory ? analysisNodeId : storyNodeId, nodeId))
  })

  const panelsWithStoryboard = sortedStoryboards(storyboards, clipOrder).flatMap((storyboard) => (
    sortPanels(storyboard.panels ?? []).map((panel) => ({ storyboard, panel }))
  ))

  const shotNodeIds = new Map<string, string>()
  panelsWithStoryboard.forEach(({ storyboard, panel }, index) => {
    const nodeId = `shot:${panel.id}`
    shotNodeIds.set(panel.id, nodeId)
    nodes.push(createNode({
      id: nodeId,
      fallbackX: 40 + COLUMN_GAP * 3,
      fallbackY: 24 + index * ROW_GAP,
      zIndex: zIndex++,
      savedLayoutByKey,
      data: {
        kind: 'shot',
        layoutNodeType: 'shot',
        targetType: 'panel',
        targetId: panel.id,
        title: translate('nodes.shot.title', { index: panelDisplayNumber(panel) }),
        eyebrow: translate('nodes.shot.eyebrow'),
        body: compactText(panel.description || panel.imagePrompt || panel.videoPrompt, translate('empty.panel')),
        meta: translate('nodes.shot.meta', {
          location: panel.location || translate('empty.location'),
        }),
        statusLabel: panel.imageTaskRunning ? translate('status.processing') : translate('status.ready'),
        width: DEFAULT_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
        indexLabel: panelDisplayNumber(panel),
        actionLabel: panel.imageTaskRunning
          ? undefined
          : hasImage(panel)
            ? translate('actions.regenerateImage')
            : translate('actions.generateImage'),
        action: panel.imageTaskRunning
          ? undefined
          : { type: 'generate_image', panelId: panel.id },
        onAction,
      },
    }))

    const source = clipNodeIds.get(storyboard.clipId) ?? analysisNodeId
    edges.push(createEdge(`edge:clip-shot:${panel.id}`, source, nodeId))
  })

  panelsWithStoryboard.forEach(({ panel }, index) => {
    const source = shotNodeIds.get(panel.id)
    if (!source) return

    if (hasImage(panel)) {
      const nodeId = `image:${panel.id}`
      nodes.push(createNode({
        id: nodeId,
        fallbackX: 40 + COLUMN_GAP * 4,
        fallbackY: 40 + index * ROW_GAP,
        zIndex: zIndex++,
        savedLayoutByKey,
        data: {
          kind: 'imageAsset',
          layoutNodeType: 'imageAsset',
          targetType: 'panel',
          targetId: panel.id,
          title: translate('nodes.image.title', { index: panelDisplayNumber(panel) }),
          eyebrow: translate('nodes.image.eyebrow'),
          body: compactText(panel.imagePrompt || panel.description, translate('empty.image')),
          meta: translate('nodes.image.meta'),
          statusLabel: panel.imageTaskRunning ? translate('status.processing') : translate('status.ready'),
          width: MEDIA_NODE_WIDTH,
          height: MEDIA_NODE_HEIGHT,
          indexLabel: `I${panelDisplayNumber(panel)}`,
          previewImageUrl: panel.media?.url ?? panel.imageUrl,
          actionLabel: panel.imageTaskRunning ? undefined : translate('actions.regenerateImage'),
          action: panel.imageTaskRunning ? undefined : { type: 'generate_image', panelId: panel.id },
          onAction,
        },
      }))
      edges.push(createEdge(`edge:shot-image:${panel.id}`, source, nodeId))
    }

    if (hasVideo(panel)) {
      const nodeId = `video:${panel.id}`
      const imageNodeId = `image:${panel.id}`
      const videoSource = hasImage(panel) ? imageNodeId : source
      nodes.push(createNode({
        id: nodeId,
        fallbackX: 40 + COLUMN_GAP * 5,
        fallbackY: 70 + index * ROW_GAP,
        zIndex: zIndex++,
        savedLayoutByKey,
        data: {
          kind: 'videoClip',
          layoutNodeType: 'videoClip',
          targetType: 'panel',
          targetId: panel.id,
          title: translate('nodes.video.title', { index: panelDisplayNumber(panel) }),
          eyebrow: translate('nodes.video.eyebrow'),
          body: compactText(panel.videoPrompt || panel.description, translate('empty.video')),
          meta: translate('nodes.video.meta'),
          statusLabel: panel.videoTaskRunning ? translate('status.processing') : translate('status.ready'),
          width: MEDIA_NODE_WIDTH,
          height: MEDIA_NODE_HEIGHT,
          indexLabel: `V${panelDisplayNumber(panel)}`,
          previewImageUrl: panel.videoMedia?.url ?? panel.videoUrl ?? panel.media?.url ?? panel.imageUrl,
          actionLabel: panel.videoTaskRunning ? undefined : translate('actions.generateVideo'),
          action: panel.videoTaskRunning
            ? undefined
            : {
                type: 'generate_video',
                storyboardId: panel.storyboardId,
                panelIndex: panel.panelIndex,
                panelId: panel.id,
              },
          onAction,
        },
      }))
      edges.push(createEdge(`edge:image-video:${panel.id}`, videoSource, nodeId))
    }
  })

  const videoNodeIds = nodes.filter((node) => node.data.kind === 'videoClip').map((node) => node.id)
  if (videoNodeIds.length > 0) {
    const finalNodeId = `final:${episodeId}`
    nodes.push(createNode({
      id: finalNodeId,
      fallbackX: 40 + COLUMN_GAP * 6,
      fallbackY: 260,
      zIndex: zIndex++,
      savedLayoutByKey,
      data: {
        kind: 'finalTimeline',
        layoutNodeType: 'finalTimeline',
        targetType: 'episode',
        targetId: episodeId,
        title: translate('nodes.final.title'),
        eyebrow: translate('nodes.final.eyebrow'),
        body: translate('nodes.final.body', { videos: videoNodeIds.length }),
        meta: translate('nodes.final.meta'),
        statusLabel: translate('status.ready'),
        width: FINAL_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
        actionLabel: translate('actions.generateAllVideos'),
        action: { type: 'generate_all_videos' },
        onAction,
      },
    }))
    videoNodeIds.forEach((videoNodeId) => {
      edges.push(createEdge(`edge:video-final:${videoNodeId}`, videoNodeId, finalNodeId))
    })
  }

  return { nodes, edges }
}

export function useWorkspaceNodeCanvasProjection(input: BuildWorkspaceNodeCanvasProjectionInput): WorkspaceCanvasProjection {
  return useMemo(
    () => buildWorkspaceNodeCanvasProjection(input),
    [
      input.clips,
      input.episodeId,
      input.onAction,
      input.savedLayouts,
      input.storyText,
      input.storyboards,
      input.translate,
    ],
  )
}
