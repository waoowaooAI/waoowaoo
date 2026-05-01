'use client'

import { useEffect, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { AppIcon } from '@/components/ui/icons'
import type { WorkspaceCanvasFlowNode } from '../node-canvas-types'

function toneClassName(kind: WorkspaceCanvasFlowNode['data']['kind']): string {
  switch (kind) {
    case 'storyInput':
      return 'border-[#2f6fed]/25'
    case 'analysis':
      return 'border-[#0891b2]/25'
    case 'scriptClip':
      return 'border-[#7c3aed]/20'
    case 'shot':
      return 'border-[#059669]/20'
    case 'imageAsset':
      return 'border-[#d97706]/20'
    case 'videoClip':
      return 'border-[#dc2626]/20'
    case 'finalTimeline':
      return 'border-[#111827]/20'
  }
}

function badgeClassName(kind: WorkspaceCanvasFlowNode['data']['kind']): string {
  switch (kind) {
    case 'storyInput':
      return 'bg-[#2f6fed]'
    case 'analysis':
      return 'bg-[#0891b2]'
    case 'scriptClip':
      return 'bg-[#7c3aed]'
    case 'shot':
      return 'bg-[#059669]'
    case 'imageAsset':
      return 'bg-[#d97706]'
    case 'videoClip':
      return 'bg-[#dc2626]'
    case 'finalTimeline':
      return 'bg-[#111827]'
  }
}

function isMediaNode(kind: WorkspaceCanvasFlowNode['data']['kind']): boolean {
  return kind === 'imageAsset' || kind === 'videoClip'
}

export default function WorkspaceNode({ data }: NodeProps<WorkspaceCanvasFlowNode>) {
  const [storyDraft, setStoryDraft] = useState(data.body)
  const isStory = data.kind === 'storyInput'
  const hasTarget = data.kind !== 'storyInput'
  const hasSource = data.kind !== 'finalTimeline'
  const action = data.action

  useEffect(() => {
    setStoryDraft(data.body)
  }, [data.body])

  return (
    <article
      className={`h-full overflow-hidden rounded-lg border bg-white shadow-[0_14px_36px_rgba(15,23,42,0.08)] ${toneClassName(data.kind)}`}
    >
      {hasTarget ? <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-white !bg-[#475569]" /> : null}
      {hasSource ? <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-white !bg-[#475569]" /> : null}

      <header className="flex items-start justify-between gap-3 border-b border-black/5 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {data.indexLabel ? (
              <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-[11px] font-semibold text-white ${badgeClassName(data.kind)}`}>
                {data.indexLabel}
              </span>
            ) : null}
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--glass-text-tertiary)]">
              {data.eyebrow}
            </p>
          </div>
          <h2 className="mt-1 truncate text-[15px] font-semibold text-[var(--glass-text-primary)]">{data.title}</h2>
        </div>
        <span className="shrink-0 rounded-full border border-black/10 bg-white px-2 py-1 text-[11px] font-medium text-[var(--glass-text-secondary)]">
          {data.statusLabel}
        </span>
      </header>

      <div className="space-y-3 px-4 py-4">
        {isStory ? (
          <textarea
            className="nodrag nowheel h-[116px] w-full resize-none rounded-md border border-[var(--glass-stroke-base)] bg-white px-3 py-3 text-sm leading-6 text-[var(--glass-text-secondary)] outline-none transition focus:border-[#2f6fed]/50"
            value={storyDraft}
            placeholder={data.body || data.title}
            onChange={(event) => setStoryDraft(event.target.value)}
            onBlur={() => {
              if (storyDraft !== data.body) {
                data.onAction?.({ type: 'update_story', value: storyDraft })
              }
            }}
          />
        ) : isMediaNode(data.kind) ? (
          <div className="h-[118px] overflow-hidden rounded-md border border-black/10 bg-[#f8fafc]">
            {data.previewImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.previewImageUrl}
                alt={data.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,#f8fafc_0%,#e2e8f0_48%,#cbd5e1_100%)]">
                <span className="rounded-full border border-white/80 bg-white/80 px-3 py-1 text-xs font-semibold text-[var(--glass-text-secondary)] shadow-sm">
                  {data.body}
                </span>
              </div>
            )}
          </div>
        ) : (
          <p className="line-clamp-4 min-h-[86px] text-sm leading-6 text-[var(--glass-text-secondary)]">{data.body}</p>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-xs text-[var(--glass-text-tertiary)]">{data.meta}</p>
          {action && data.actionLabel ? (
            <button
              type="button"
              className="nodrag inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[#111827] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0f172a]"
              onClick={() => data.onAction?.(action)}
            >
              <AppIcon name="arrowRight" className="h-3.5 w-3.5" />
              {data.actionLabel}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  )
}
