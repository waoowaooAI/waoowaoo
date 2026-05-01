'use client'

import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'
import type { ProjectCanvasFlowEdge } from '../flow-types'

export default function DependencyEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps<ProjectCanvasFlowEdge>) {
  const [edgePath] = getBezierPath({
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
        stroke: 'var(--glass-accent-from)',
        strokeWidth: 1.5,
      }}
    />
  )
}
