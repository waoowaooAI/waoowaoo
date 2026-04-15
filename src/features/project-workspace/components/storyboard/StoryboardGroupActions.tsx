'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { GlassButton } from '@/components/ui/primitives'
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
      <GlassButton
        variant="secondary"
        size="sm"
        onClick={onRegenerateText}
        disabled={isSubmittingStoryboardTextTask}
      >
        {isSubmittingStoryboardTextTask ? (
          <TaskStatusInline state={textTaskRunningState} />
        ) : (
          <>
            <AppIcon name="refresh" className="h-3 w-3" />
            <span>{t('group.regenerateText')}</span>
          </>
        )}
      </GlassButton>

      {pendingCount > 0 && (
        <GlassButton
          variant="primary"
          size="sm"
          onClick={onGenerateAllIndividually}
          disabled={currentRunningCount > 0}
          title={t('group.generateMissingImages')}
        >
          {currentRunningCount > 0 ? (
            <TaskStatusInline state={panelTaskRunningState} />
          ) : (
            <>
              <AppIcon name="plus" className="h-3 w-3" />
              <span>{t('group.generateAll')}</span>
              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-white/25 text-white">{pendingCount}</span>
            </>
          )}
        </GlassButton>
      )}

      <GlassButton
        variant="secondary"
        size="sm"
        onClick={onAddPanel}
      >
        <AppIcon name="plusMd" className="h-3.5 w-3.5" />
        <span>{t('group.addPanel')}</span>
      </GlassButton>

      <GlassButton
        variant="danger"
        size="sm"
        onClick={onDeleteStoryboard}
        disabled={isSubmittingStoryboardTask}
        title={t('common.delete')}
      >
        <AppIcon name="trashAlt" className="h-3.5 w-3.5" />
        <span>{t('common.delete')}</span>
      </GlassButton>
    </div>
  )
}

