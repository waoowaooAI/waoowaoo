'use client'

import { useTranslations } from 'next-intl'
import type { DeleteConfirmState, SplitEpisode } from '../types'
import { AppIcon } from '@/components/ui/icons'

interface StepMappingProps {
  episodes: SplitEpisode[]
  selectedEpisode: number
  onSelectEpisode: (index: number) => void
  onUpdateEpisodeNumber: (index: number, number: number) => void
  onUpdateEpisodeTitle: (index: number, title: string) => void
  onUpdateEpisodeSummary: (index: number, summary: string) => void
  onUpdateEpisodeContent: (index: number, content: string) => void
  onAddEpisode: () => void
  deleteConfirm: DeleteConfirmState
  onOpenDeleteConfirm: (index: number, title: string) => void
  onCloseDeleteConfirm: () => void
  onConfirmDeleteEpisode: () => void
}

export default function StepMapping({
  episodes,
  selectedEpisode,
  onSelectEpisode,
  onUpdateEpisodeNumber,
  onUpdateEpisodeTitle,
  onUpdateEpisodeSummary,
  onUpdateEpisodeContent,
  onAddEpisode,
  deleteConfirm,
  onOpenDeleteConfirm,
  onCloseDeleteConfirm,
  onConfirmDeleteEpisode,
}: StepMappingProps) {
  const t = useTranslations('smartImport')

  return (
    <>
      {deleteConfirm.show && (
        <div className="fixed inset-0 glass-overlay flex items-center justify-center z-50" onClick={onCloseDeleteConfirm}>
          <div className="glass-surface-modal p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-[var(--glass-tone-danger-bg)] rounded-full flex items-center justify-center mx-auto mb-4">
                <AppIcon name="trash" className="w-6 h-6 text-[var(--glass-tone-danger-fg)]" />
              </div>
              <h3 className="text-lg font-bold text-[var(--glass-text-primary)] mb-2">{t('preview.deleteConfirm.title')}</h3>
              <p className="text-[var(--glass-text-secondary)]">{t('preview.deleteConfirm.message', { title: deleteConfirm.title })}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={onCloseDeleteConfirm}
                className="flex-1 px-4 py-2.5 border border-[var(--glass-stroke-strong)] rounded-lg font-medium hover:bg-[var(--glass-bg-muted)] transition-colors"
              >
                {t('preview.deleteConfirm.cancel')}
              </button>
              <button
                onClick={onConfirmDeleteEpisode}
                className="flex-1 px-4 py-2.5 bg-[var(--glass-tone-danger-fg)] text-white rounded-lg font-medium hover:bg-[var(--glass-tone-danger-fg)] transition-colors"
              >
                {t('preview.deleteConfirm.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-[var(--glass-bg-surface)] rounded-2xl border border-[var(--glass-stroke-base)] p-6 sticky top-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">{t('preview.episodeList')}</h3>
              <span className="text-sm text-[var(--glass-text-tertiary)]">{episodes.length} {t('preview.episodeList')}</span>
            </div>

            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {episodes.map((ep, idx) => (
                <div
                  key={idx}
                  onClick={() => onSelectEpisode(idx)}
                  className={`p-4 rounded-xl transition-all duration-200 cursor-pointer relative group ${selectedEpisode === idx
                    ? 'bg-[var(--glass-tone-info-bg)] border-2 border-[var(--glass-stroke-focus)]'
                    : 'bg-[var(--glass-bg-surface)] border border-[var(--glass-stroke-base)] hover:border-[var(--glass-stroke-focus)]'
                    }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <input
                      type="text"
                      value={t('episode', { num: ep.number })}
                      onChange={(e) => {
                        const match = e.target.value.match(/\d+/)
                        const newNumber = match ? parseInt(match[0], 10) : ep.number
                        if (newNumber !== ep.number) {
                          onUpdateEpisodeNumber(idx, newNumber)
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className={`font-semibold bg-transparent border-b border-transparent hover:border-[var(--glass-stroke-strong)] focus:border-[var(--glass-stroke-focus)] focus:outline-none w-24 ${selectedEpisode === idx ? 'text-[var(--glass-tone-info-fg)]' : 'text-[var(--glass-text-secondary)]'}`}
                    />
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${selectedEpisode === idx ? 'bg-[var(--glass-accent-from)] text-white' : 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)]'
                        }`}>
                        {ep.wordCount.toLocaleString()} {t('upload.words')}
                      </span>
                      {episodes.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onOpenDeleteConfirm(idx, t('episode', { num: ep.number }))
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-[var(--glass-tone-danger-fg)] hover:bg-[var(--glass-tone-danger-bg)] rounded transition-all"
                          title={t('preview.deleteEpisode')}
                        >
                          <AppIcon name="trash" className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    type="text"
                    value={ep.title}
                    onChange={(e) => onUpdateEpisodeTitle(idx, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder={t('preview.episodePlaceholder')}
                    className="text-sm text-[var(--glass-text-secondary)] font-medium w-full bg-transparent border-b border-transparent hover:border-[var(--glass-stroke-strong)] focus:border-[var(--glass-stroke-focus)] focus:outline-none"
                  />
                  <input
                    type="text"
                    value={ep.summary}
                    onChange={(e) => onUpdateEpisodeSummary(idx, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder={t('preview.summaryPlaceholder')}
                    className="text-xs text-[var(--glass-text-tertiary)] w-full bg-transparent border-b border-transparent hover:border-[var(--glass-stroke-strong)] focus:border-[var(--glass-stroke-focus)] focus:outline-none mt-1"
                  />
                </div>
              ))}
            </div>

            <button
              onClick={onAddEpisode}
              className="w-full mt-4 py-3 border-2 border-dashed border-[var(--glass-stroke-strong)] rounded-xl text-[var(--glass-text-tertiary)] hover:border-[var(--glass-stroke-focus)] hover:text-[var(--glass-tone-info-fg)] hover:bg-[var(--glass-tone-info-bg)] transition-all duration-200 flex items-center justify-center gap-2"
            >
              <AppIcon name="plus" className="w-5 h-5" />
              {t('preview.addEpisode')}
            </button>

            <div className="mt-4 pt-4 border-t border-[var(--glass-stroke-base)] space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--glass-text-secondary)]">{t('preview.averageWords')}</span>
                <span className="font-semibold">
                  {episodes.length > 0 ? Math.round(episodes.reduce((sum, ep) => sum + ep.wordCount, 0) / episodes.length).toLocaleString() : 0} {t('upload.words')}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {episodes[selectedEpisode] && (
            <div className="bg-[var(--glass-bg-surface)] rounded-2xl border border-[var(--glass-stroke-base)] p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <input
                    type="text"
                    value={episodes[selectedEpisode].title}
                    onChange={(e) => onUpdateEpisodeTitle(selectedEpisode, e.target.value)}
                    className="text-2xl font-semibold border-b-2 border-transparent hover:border-[var(--glass-stroke-base)] focus:border-[var(--glass-stroke-focus)] focus:outline-none transition-colors duration-200 px-2"
                  />
                  <span className="text-sm text-[var(--glass-text-tertiary)]">{t('episode', { num: episodes[selectedEpisode].number })}</span>
                </div>
                <span className="text-sm text-[var(--glass-text-tertiary)]">{episodes[selectedEpisode].wordCount.toLocaleString()} {t('upload.words')}</span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-semibold text-[var(--glass-text-secondary)]">{t('preview.episodeContent')}</label>
                  <span className="text-sm text-[var(--glass-text-tertiary)]">{episodes[selectedEpisode].wordCount.toLocaleString()} {t('upload.words')}</span>
                </div>
                <textarea
                  rows={16}
                  value={episodes[selectedEpisode].content}
                  onChange={(e) => onUpdateEpisodeContent(selectedEpisode, e.target.value)}
                  className="w-full border border-[var(--glass-stroke-strong)] rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-[var(--glass-focus-ring-strong)] focus:border-[var(--glass-stroke-focus)] resize-none font-mono text-sm leading-relaxed"
                />
              </div>

              <div className="mt-4 p-4 bg-[var(--glass-tone-info-bg)] border border-[var(--glass-stroke-focus)] rounded-xl">
                <div className="flex items-start gap-3">
                  <AppIcon name="info" className="w-5 h-5 text-[var(--glass-tone-info-fg)] flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-[var(--glass-text-primary)] mb-1">{t('plotSummary')}</p>
                    <p className="text-sm text-[var(--glass-text-primary)]">
                      {episodes[selectedEpisode].summary || t('preview.summaryPlaceholder')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
