'use client'

import type { EdgeTypes } from '@xyflow/react'
import DependencyEdge from './DependencyEdge'
import SequenceEdge from './SequenceEdge'

export const projectCanvasEdgeTypes = {
  sequence: SequenceEdge,
  dependsOn: DependencyEdge,
  generates: DependencyEdge,
  references: DependencyEdge,
  voiceBinding: DependencyEdge,
  timelinePlacement: DependencyEdge,
} satisfies EdgeTypes
