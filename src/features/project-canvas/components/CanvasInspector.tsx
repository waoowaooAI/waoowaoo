'use client'

import { useTranslations } from 'next-intl'
import type { ProjectCanvasFlowNode } from '../flow-types'

interface CanvasInspectorProps {
  readonly selectedNode: ProjectCanvasFlowNode | null
}

export default function CanvasInspector({ selectedNode }: CanvasInspectorProps) {
  const t = useTranslations('projectWorkflow.canvas')

  if (!selectedNode) {
    return (
      <aside className="w-72 shrink-0 border-l border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-surface)] p-4">
        <h3 className="text-sm font-semibold text-[var(--glass-text-primary)]">{t('inspector.title')}</h3>
        <p className="mt-2 text-sm text-[var(--glass-text-tertiary)]">{t('inspector.empty')}</p>
      </aside>
    )
  }

  return (
    <aside className="w-72 shrink-0 border-l border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-surface)] p-4">
      <h3 className="text-sm font-semibold text-[var(--glass-text-primary)]">{t('inspector.title')}</h3>
      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="text-xs uppercase text-[var(--glass-text-tertiary)]">{t('inspector.nodeType')}</dt>
          <dd className="mt-1 text-[var(--glass-text-primary)]">{t(`nodeTypes.${selectedNode.data.nodeType}`)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--glass-text-tertiary)]">{t('inspector.status')}</dt>
          <dd className="mt-1 text-[var(--glass-text-primary)]">{t(`status.${selectedNode.data.status}`)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--glass-text-tertiary)]">{t('inspector.nodeKey')}</dt>
          <dd className="mt-1 break-all font-mono text-xs text-[var(--glass-text-secondary)]">
            {selectedNode.data.nodeKey}
          </dd>
        </div>
      </dl>
    </aside>
  )
}
