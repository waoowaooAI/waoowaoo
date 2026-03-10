'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQuickMangaHistory, type QuickMangaHistoryItem, type QuickMangaHistoryStatus } from '@/lib/query/hooks'
import { useWorkspaceProvider } from '../WorkspaceProvider'

type QuickMangaHistoryPanelProps = {
  enabled: boolean
}

const EMPTY_HISTORY: QuickMangaHistoryItem[] = []

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function getStatusTone(statusBucket: QuickMangaHistoryItem['statusBucket']): string {
  if (statusBucket === 'success') return 'text-emerald-300'
  if (statusBucket === 'cancelled') return 'text-amber-300'
  return 'text-rose-300'
}

function formatStrength(value: number): string {
  const normalized = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
  return `${Math.round(normalized * 100)}%`
}

function resolveConflictHintLabel(
  hint: QuickMangaHistoryItem['continuityConflictHint'],
  t: ReturnType<typeof useTranslations>,
): string {
  if (hint === 'style-lock-priority') return t('storyInput.manga.history.conflictHints.styleLockPriority')
  if (hint === 'chapter-context-priority') return t('storyInput.manga.history.conflictHints.chapterContextPriority')
  return t('storyInput.manga.history.conflictHints.balanced')
}

export default function QuickMangaHistoryPanel({ enabled }: QuickMangaHistoryPanelProps) {
  const t = useTranslations('novelPromotion')
  const { projectId } = useWorkspaceProvider()

  const [statusFilter, setStatusFilter] = useState<QuickMangaHistoryStatus>('all')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  const query = useQuickMangaHistory({
    projectId,
    status: statusFilter,
    limit: 20,
    enabled,
  })

  const history = query.data || EMPTY_HISTORY

  const selected = useMemo(() => {
    if (!history.length) return null
    if (selectedRunId) {
      const found = history.find((item) => item.runId === selectedRunId)
      if (found) return found
    }
    return history[0]
  }, [history, selectedRunId])

  if (!enabled) return null

  return (
    <div className="glass-surface p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--glass-text-muted)]">{t('storyInput.manga.history.title')}</h3>
          <p className="text-xs text-[var(--glass-text-tertiary)] mt-1">{t('storyInput.manga.history.description')}</p>
        </div>
        <div className="flex items-center gap-2">
          {(['all', 'success', 'failed', 'cancelled'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`glass-btn-base rounded-lg px-2.5 py-1.5 text-xs ${statusFilter === status ? 'glass-btn-tone-info' : 'glass-btn-secondary'}`}
            >
              {t(`storyInput.manga.history.filters.${status}`)}
            </button>
          ))}
        </div>
      </div>

      {query.isLoading && (
        <p className="text-sm text-[var(--glass-text-tertiary)]">{t('storyInput.manga.history.loading')}</p>
      )}

      {!query.isLoading && history.length === 0 && (
        <p className="text-sm text-[var(--glass-text-tertiary)]">{t('storyInput.manga.history.empty')}</p>
      )}

      {!query.isLoading && history.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,1fr)] gap-4">
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
            {history.map((item) => {
              const active = selected?.runId === item.runId
              return (
                <button
                  key={item.runId}
                  type="button"
                  onClick={() => setSelectedRunId(item.runId)}
                  className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${active
                    ? 'border-[var(--glass-tone-info-fg)] bg-[var(--glass-tone-info-bg)]/20'
                    : 'border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-muted)]/20 hover:bg-[var(--glass-bg-muted)]/40'
                    }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-[var(--glass-text-tertiary)]">{formatDateTime(item.createdAt)}</span>
                    <span className={`text-xs font-semibold uppercase tracking-wide ${getStatusTone(item.statusBucket)}`}>
                      {t(`storyInput.manga.history.filters.${item.statusBucket}`)}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-[var(--glass-text-primary)] line-clamp-2">
                    {item.preview.inputSnippet || item.preview.outputSnippet || t('storyInput.manga.history.noPreview')}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="glass-surface-soft rounded-xl p-4 space-y-3">
            {selected && (
              <>
                <div className="text-xs text-[var(--glass-text-tertiary)]">#{selected.runId}</div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-[var(--glass-text-tertiary)]">{t('storyInput.manga.history.metadata.stage')}</div>
                    <div className="text-[var(--glass-text-primary)] font-medium">
                      {selected.stage === 'story-to-script'
                        ? t('storyInput.manga.history.stage.storyToScript')
                        : t('storyInput.manga.history.stage.scriptToStoryboard')}
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--glass-text-tertiary)]">{t('storyInput.manga.history.metadata.status')}</div>
                    <div className="text-[var(--glass-text-primary)] font-medium">{selected.status}</div>
                  </div>
                  <div>
                    <div className="text-[var(--glass-text-tertiary)]">{t('storyInput.manga.history.metadata.preset')}</div>
                    <div className="text-[var(--glass-text-primary)] font-medium">{selected.options.preset}</div>
                  </div>
                  <div>
                    <div className="text-[var(--glass-text-tertiary)]">{t('storyInput.manga.history.metadata.layout')}</div>
                    <div className="text-[var(--glass-text-primary)] font-medium">{selected.options.layout}</div>
                  </div>
                  <div>
                    <div className="text-[var(--glass-text-tertiary)]">{t('storyInput.manga.history.metadata.colorMode')}</div>
                    <div className="text-[var(--glass-text-primary)] font-medium">{selected.options.colorMode}</div>
                  </div>
                  <div>
                    <div className="text-[var(--glass-text-tertiary)]">{t('storyInput.manga.history.metadata.style')}</div>
                    <div className="text-[var(--glass-text-primary)] font-medium">{selected.options.style || 'auto'}</div>
                  </div>
                  <div>
                    <div className="text-[var(--glass-text-tertiary)]">{t('storyInput.manga.history.metadata.styleLockProfile')}</div>
                    <div className="text-[var(--glass-text-primary)] font-medium">{selected.controls.styleLock.profile}</div>
                  </div>
                  <div>
                    <div className="text-[var(--glass-text-tertiary)]">{t('storyInput.manga.history.metadata.styleLockStrength')}</div>
                    <div className="text-[var(--glass-text-primary)] font-medium">{formatStrength(selected.controls.styleLock.strength)}</div>
                  </div>
                  <div>
                    <div className="text-[var(--glass-text-tertiary)]">{t('storyInput.manga.history.metadata.chapterContinuityMode')}</div>
                    <div className="text-[var(--glass-text-primary)] font-medium">{selected.controls.chapterContinuity.mode}</div>
                  </div>
                  <div>
                    <div className="text-[var(--glass-text-tertiary)]">{t('storyInput.manga.history.metadata.chapterId')}</div>
                    <div className="text-[var(--glass-text-primary)] font-medium">{selected.controls.chapterContinuity.chapterId || '—'}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-[var(--glass-text-tertiary)]">{t('storyInput.manga.history.metadata.conflictPolicy')}</div>
                    <div className="text-[var(--glass-text-primary)] font-medium">{selected.controls.chapterContinuity.conflictPolicy}</div>
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-muted)]/20 p-2.5 text-xs text-[var(--glass-text-secondary)]">
                  <div className="font-semibold text-[var(--glass-text-primary)]">
                    {t('storyInput.manga.history.continuityConflict.title')}
                  </div>
                  <div className="mt-1">{resolveConflictHintLabel(selected.continuityConflictHint, t)}</div>
                  <div className="mt-1 text-[var(--glass-text-tertiary)]">{t('storyInput.manga.history.continuityConflict.helpText')}</div>
                </div>
                {selected.continuity && (
                  <div className="rounded-lg border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-muted)]/20 p-2.5 text-xs text-[var(--glass-text-secondary)]">
                    <div>
                      {t('storyInput.manga.history.continuityShortcut.sourceRun', { runId: selected.continuity.sourceRunId })}
                    </div>
                    <div className="mt-1">
                      {t('storyInput.manga.history.continuityShortcut.sourceStage')}: {selected.continuity.sourceStage}
                    </div>
                  </div>
                )}
                {selected.errorMessage && (
                  <div className="rounded-lg border border-rose-400/40 bg-rose-400/10 p-2 text-xs text-rose-200">
                    {selected.errorMessage}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
