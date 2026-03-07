'use client'
import { useTranslations } from 'next-intl'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import type { TaskPresentationState } from '@/lib/task/presentation'
import type { ShotVariantSuggestion } from './PanelVariantModal.types'

interface PanelVariantModalSuggestionListProps {
  isAnalyzing: boolean
  suggestions: ShotVariantSuggestion[]
  error: string | null
  selectedVariantId: number | null
  isSubmittingVariantTask: boolean
  analyzeTaskRunningState: TaskPresentationState | null
  variantTaskRunningState: TaskPresentationState | null
  onReanalyze: () => void
  onSelectVariant: (suggestion: ShotVariantSuggestion) => void
}

export default function PanelVariantModalSuggestionList({
  isAnalyzing,
  suggestions,
  error,
  selectedVariantId,
  isSubmittingVariantTask,
  analyzeTaskRunningState,
  variantTaskRunningState,
  onReanalyze,
  onSelectVariant,
}: PanelVariantModalSuggestionListProps) {
  const t = useTranslations('storyboard')
  const renderScore = (score: number) => t('variant.creativeScore', { score })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-[var(--glass-text-primary)] flex items-center gap-2">
          {t('variant.aiRecommend')}
          {isAnalyzing && (
            <TaskStatusInline
              state={analyzeTaskRunningState}
              className="text-[var(--glass-tone-info-fg)] [&>span]:text-[var(--glass-tone-info-fg)] [&_svg]:text-[var(--glass-tone-info-fg)]"
            />
          )}
        </h3>
        {!isAnalyzing && suggestions.length > 0 && (
          <button
            onClick={onReanalyze}
            className="text-xs text-[var(--glass-tone-info-fg)] hover:text-[var(--glass-text-primary)] flex items-center gap-1"
          >
            {t('variant.reanalyze')}
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-[var(--glass-tone-danger-bg)] text-[var(--glass-tone-danger-fg)] text-sm rounded-lg mb-3 border border-[var(--glass-stroke-danger)]">
          {error}
        </div>
      )}

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {suggestions.map((suggestion) => (
          <div
            key={suggestion.id}
            className={`p-3 border rounded-lg transition-colors cursor-pointer ${selectedVariantId === suggestion.id ? 'border-[var(--glass-stroke-focus)] bg-[var(--glass-tone-info-bg)]' : 'border-[var(--glass-stroke-base)] hover:border-[var(--glass-stroke-focus)] hover:bg-[var(--glass-bg-muted)]'}`}
            onClick={() => !isSubmittingVariantTask && onSelectVariant(suggestion)}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--glass-tone-warning-fg)]">{renderScore(suggestion.creative_score)}</span>
                  <h4 className="text-sm font-medium text-[var(--glass-text-primary)]">{suggestion.title}</h4>
                </div>
                <p className="text-xs text-[var(--glass-text-secondary)] mt-1">{suggestion.description}</p>
                <div className="flex gap-2 mt-1">
                  <span className="text-xs text-[var(--glass-text-tertiary)]">{t('variant.shotType')} {suggestion.shot_type}</span>
                  <span className="text-xs text-[var(--glass-text-tertiary)]">{t('variant.cameraMove')} {suggestion.camera_move}</span>
                </div>
              </div>
              <button
                disabled={isSubmittingVariantTask}
                className={`glass-btn-base px-3 py-1 text-xs rounded-lg ${isSubmittingVariantTask && selectedVariantId === suggestion.id ? 'glass-btn-soft text-[var(--glass-text-tertiary)]' : 'glass-btn-primary text-white'}`}
              >
                {isSubmittingVariantTask && selectedVariantId === suggestion.id ? (
                  <TaskStatusInline
                    state={variantTaskRunningState}
                    className="text-[var(--glass-text-tertiary)] [&>span]:text-[var(--glass-text-tertiary)] [&_svg]:text-[var(--glass-text-tertiary)]"
                  />
                ) : t('candidate.select')}
              </button>
            </div>
          </div>
        ))}

        {!isAnalyzing && suggestions.length === 0 && !error && (
          <div className="text-center py-8 text-[var(--glass-text-tertiary)] text-sm">
            {t('variant.clickToAnalyze')}
          </div>
        )}
      </div>
    </div>
  )
}
