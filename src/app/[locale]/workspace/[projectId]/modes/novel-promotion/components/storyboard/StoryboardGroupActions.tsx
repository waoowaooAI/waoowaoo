'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { AppIcon } from '@/components/ui/icons'

interface StoryboardGroupActionsProps {
  hasAnyImage: boolean
  isSubmittingStoryboardTask: boolean
  isSubmittingStoryboardTextTask: boolean
  currentRunningCount: number
  pendingCount: number
  onRegenerateText: () => void
  onGenerateAllIndividually: () => void
  onAddPanel: () => void
  onDeleteStoryboard: () => void
}

export default function StoryboardGroupActions({
  hasAnyImage,
  isSubmittingStoryboardTask,
  isSubmittingStoryboardTextTask,
  currentRunningCount,
  pendingCount,
  onRegenerateText,
  onGenerateAllIndividually,
  onAddPanel,
  onDeleteStoryboard,
}: StoryboardGroupActionsProps) {
  const t = useTranslations('storyboard')

  const textTaskRunningState = useMemo(() => {
    if (!isSubmittingStoryboardTextTask) return null
    return resolveTaskPresentationState({
      phase: 'processing',
      intent: 'regenerate',
      resource: 'text',
      hasOutput: true,
    })
  }, [isSubmittingStoryboardTextTask])

  const panelTaskRunningState = useMemo(() => {
    if (currentRunningCount <= 0) return null
    return resolveTaskPresentationState({
      phase: 'processing',
      intent: hasAnyImage ? 'regenerate' : 'generate',
      resource: 'image',
      hasOutput: hasAnyImage,
    })
  }, [currentRunningCount, hasAnyImage])

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onRegenerateText}
        disabled={isSubmittingStoryboardTextTask}
        className={`px-3 py-1.5 text-xs rounded-xl transition-all flex items-center gap-1.5 shadow-sm glass-btn-base ${isSubmittingStoryboardTextTask
          ? 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-tertiary)] cursor-not-allowed'
          : 'glass-btn-tone-warning'
          }`}
      >
        {isSubmittingStoryboardTextTask ? (
          <TaskStatusInline state={textTaskRunningState} />
        ) : (
          <>
            <AppIcon name="refresh" className="h-3 w-3 text-[var(--glass-tone-warning-fg)]" />
            <span>{t('group.regenerateText')}</span>
          </>
        )}
      </button>

      {pendingCount > 0 && (
        <button
          onClick={onGenerateAllIndividually}
          disabled={currentRunningCount > 0}
          className="glass-btn-base glass-btn-tone-info px-3 py-1.5 text-xs rounded-xl transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          title={t('group.generateMissingImages')}
        >
          {currentRunningCount > 0 ? (
            <TaskStatusInline state={panelTaskRunningState} />
          ) : (
            <>
              <AppIcon name="plus" className="h-3 w-3 text-[var(--glass-tone-info-fg)]" />
              <span>{t('group.generateAll')}</span>
              <span className="glass-chip glass-chip-info px-1.5 py-0.5 text-[10px] font-medium">{pendingCount}</span>
            </>
          )}
        </button>
      )}

      <button
        onClick={onAddPanel}
        className="glass-btn-base glass-btn-tone-success px-3 py-1.5 text-xs rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
      >
        <AppIcon name="plusMd" className="h-3.5 w-3.5" />
        <span>{t('group.addPanel')}</span>
      </button>

      <button
        onClick={onDeleteStoryboard}
        disabled={isSubmittingStoryboardTask}
        className="glass-btn-base glass-btn-tone-danger px-3 py-1.5 text-xs rounded-xl transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        title={t('common.delete')}
      >
        <AppIcon name="trashAlt" className="h-3.5 w-3.5" />
        <span>{t('common.delete')}</span>
      </button>
    </div>
  )
}
