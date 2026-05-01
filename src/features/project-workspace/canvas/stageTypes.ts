import type { CanvasNodeLayoutInput } from '@/lib/project-canvas/layout/canvas-layout-contract'

export const CANVAS_STAGE_IDS = ['story', 'script', 'storyboard', 'video', 'final'] as const

export type CanvasStageId = (typeof CANVAS_STAGE_IDS)[number]

export interface CanvasStageDefinition {
  readonly id: CanvasStageId
  readonly order: number
  readonly layoutNodeType: CanvasNodeLayoutInput['nodeType']
  readonly titleKey: string
  readonly descriptionKey: string
}

export const CANVAS_STAGE_DEFINITIONS: readonly CanvasStageDefinition[] = [
  {
    id: 'story',
    order: 0,
    layoutNodeType: 'story',
    titleKey: 'stages.story.title',
    descriptionKey: 'stages.story.description',
  },
  {
    id: 'script',
    order: 1,
    layoutNodeType: 'scriptClip',
    titleKey: 'stages.script.title',
    descriptionKey: 'stages.script.description',
  },
  {
    id: 'storyboard',
    order: 2,
    layoutNodeType: 'storyboardGroup',
    titleKey: 'stages.storyboard.title',
    descriptionKey: 'stages.storyboard.description',
  },
  {
    id: 'video',
    order: 3,
    layoutNodeType: 'videoPanel',
    titleKey: 'stages.video.title',
    descriptionKey: 'stages.video.description',
  },
  {
    id: 'final',
    order: 4,
    layoutNodeType: 'timeline',
    titleKey: 'stages.final.title',
    descriptionKey: 'stages.final.description',
  },
]

export function isCanvasStageId(value: string): value is CanvasStageId {
  return CANVAS_STAGE_IDS.includes(value as CanvasStageId)
}
