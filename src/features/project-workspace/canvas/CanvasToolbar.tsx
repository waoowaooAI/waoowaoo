'use client'

interface CanvasToolbarProps {
  readonly title: string
  readonly subtitle: string
  readonly summary: string
  readonly resetLabel: string
  readonly fitViewLabel: string
  readonly loadingLabel: string
  readonly savingLabel: string
  readonly errorLabel: string | null
  readonly statusItems: readonly string[]
  readonly isLoading: boolean
  readonly isSaving: boolean
  readonly onResetLayout: () => void
  readonly onFitView: () => void
}

export default function CanvasToolbar({
  title,
  subtitle,
  summary,
  resetLabel,
  fitViewLabel,
  loadingLabel,
  savingLabel,
  errorLabel,
  statusItems,
  isLoading,
  isSaving,
  onResetLayout,
  onFitView,
}: CanvasToolbarProps) {
  return (
    <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-surface)] px-4 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-sm font-semibold text-[var(--glass-text-primary)]">{title}</h1>
          <span className="text-xs text-[var(--glass-text-tertiary)]">{summary}</span>
          {isLoading ? <span className="text-xs text-[var(--glass-text-tertiary)]">{loadingLabel}</span> : null}
          {isSaving ? <span className="text-xs text-[var(--glass-text-tertiary)]">{savingLabel}</span> : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-[var(--glass-text-secondary)]">{subtitle}</p>
        {errorLabel ? <p className="mt-1 text-xs text-[var(--glass-danger)]">{errorLabel}</p> : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {statusItems.map((item) => (
            <span
              key={item}
              className="rounded-full border border-[var(--glass-stroke-base)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--glass-text-secondary)]"
            >
              {item}
            </span>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-md border border-[var(--glass-stroke-soft)] px-3 py-1.5 text-xs text-[var(--glass-text-secondary)] transition hover:bg-[var(--glass-bg-hover)]"
          onClick={onFitView}
        >
          {fitViewLabel}
        </button>
        <button
          type="button"
          className="rounded-md border border-[var(--glass-stroke-strong)] px-3 py-1.5 text-xs font-medium text-[var(--glass-text-primary)] transition hover:bg-[var(--glass-bg-hover)]"
          onClick={onResetLayout}
        >
          {resetLabel}
        </button>
      </div>
    </div>
  )
}
