'use client'

import type { NodeProps } from '@xyflow/react'
import type { CanvasStageNode } from '../workspace-canvas-types'

export default function CanvasStageNode({ data, selected }: NodeProps<CanvasStageNode>) {
  const primaryAction = data.primaryAction

  return (
    <section
      className={[
        'h-full overflow-hidden rounded-lg border bg-[var(--glass-bg-surface)] shadow-[var(--glass-shadow-soft)]',
        selected ? 'border-[var(--glass-primary)]' : 'border-[var(--glass-stroke-soft)]',
      ].join(' ')}
    >
      <header className="flex h-[92px] items-start justify-between gap-4 border-b border-[var(--glass-stroke-soft)] px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-[var(--glass-text-primary)]">
              {data.title}
            </h2>
            <span className="shrink-0 rounded-full border border-[var(--glass-stroke-soft)] px-2 py-0.5 text-[11px] text-[var(--glass-text-tertiary)]">
              {data.statusLabel}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--glass-text-secondary)]">
            {data.description}
          </p>
        </div>

        {primaryAction ? (
          <button
            type="button"
            className="nodrag shrink-0 rounded-md border border-[var(--glass-stroke-strong)] px-3 py-1.5 text-xs font-medium text-[var(--glass-text-primary)] transition hover:bg-[var(--glass-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={primaryAction.disabled || primaryAction.busy}
            onClick={() => {
              void primaryAction.run()
            }}
          >
            {primaryAction.label}
          </button>
        ) : null}
      </header>

      {!data.collapsed ? (
        <div className="flex h-[calc(100%-92px)] flex-col gap-3 overflow-hidden p-4">
          <div className="rounded-md border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-canvas)] p-3">
            <p className="text-xs leading-5 text-[var(--glass-text-secondary)]">{data.summary}</p>
          </div>
          <div className="min-h-0 flex-1 rounded-md border border-dashed border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-canvas)] p-3">
            <p className="text-xs leading-5 text-[var(--glass-text-tertiary)]">{data.description}</p>
          </div>
        </div>
      ) : null}
    </section>
  )
}
