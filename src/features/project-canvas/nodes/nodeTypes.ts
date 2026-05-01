'use client'

import type { NodeTypes } from '@xyflow/react'
import PanelImageNode from './PanelImageNode'
import ScriptClipNode from './ScriptClipNode'
import StoryNode from './StoryNode'
import StoryboardGroupNode from './StoryboardGroupNode'
import TimelineNode from './TimelineNode'
import VideoPanelNode from './VideoPanelNode'

export const projectCanvasNodeTypes = {
  story: StoryNode,
  scriptClip: ScriptClipNode,
  storyboardGroup: StoryboardGroupNode,
  panelImage: PanelImageNode,
  videoPanel: VideoPanelNode,
  timeline: TimelineNode,
} satisfies NodeTypes
