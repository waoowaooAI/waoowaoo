'use client'

import type { ReactNode } from 'react'
import { Handle, Position } from '@xyflow/react'
import { useTranslations } from 'next-intl'
import type { ProjectCanvasFlowNodeData } from '../flow-types'

interface CanvasNodeShellProps {
  readonly data: ProjectCanvasFlowNodeData
  readonly title: string
  readonly children?: ReactNode
}

const STATUS_CLASS_NAME: Record<ProjectCanvasFlowNodeData['status'], string> = {
  idle: 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-tertiary)]',
  queued: 'bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]',
  processing: 'bg-[var(--glass-tone-warning-bg)] text-[var(--glass-tone-warning-fg)]',
  failed: 'bg-[var(--glass-tone-danger-bg)] text-[var(--glass-tone-danger-fg)]',
  ready: 'bg-[var(--glass-tone-success-bg)] text-[var(--glass-tone-success-fg)]',
}

export default function CanvasNodeShell({ data, title, children }: CanvasNodeShellProps) {
  const t = useTranslations('projectWorkflow.canvas')

  return (
    <div className="relative h-full min-h-[160px] w-[320px] rounded-lg border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-surface)] shadow-[var(--glass-shadow-sm)]">
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-[var(--glass-stroke-strong)] !bg-[var(--glass-accent-from)]"
      />
      <div className="flex items-start justify-between gap-3 border-b border-[var(--glass-stroke-soft)] px-3 py-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase text-[var(--glass-text-tertiary)]">
            {t(`nodeTypes.${data.nodeType}`)}
          </div>
          <div className="truncate text-sm font-semibold text-[var(--glass-text-primary)]">
            {title}
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${STATUS_CLASS_NAME[data.status]}`}>
          {t(`status.${data.status}`)}
        </span>
      </div>
      <div className="px-3 py-3 text-sm text-[var(--glass-text-secondary)]">
        {children}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-[var(--glass-stroke-strong)] !bg-[var(--glass-accent-from)]"
      />
    </div>
  )
}
