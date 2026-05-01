'use client'

import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react'
import type { ProjectCanvasFlowEdge } from '../flow-types'

export default function SequenceEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps<ProjectCanvasFlowEdge>) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  return (
    <BaseEdge
      path={edgePath}
      style={{
        stroke: 'var(--glass-text-tertiary)',
        strokeWidth: 1.25,
      }}
    />
  )
}
