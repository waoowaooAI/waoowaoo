'use client'

import { useTranslations } from 'next-intl'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import type { TaskPresentationState } from '@/lib/task/presentation'
import { AppIcon } from '@/components/ui/icons'
import ImageGenerationInlineCountButton from '@/components/image-generation/ImageGenerationInlineCountButton'
import { getImageGenerationCountOptions } from '@/lib/image-generation/count'

type LocationCardActionsProps =
  | {
    mode: 'selection'
    selectedIndex: number | null
    isConfirmingSelection: boolean
    confirmingSelectionState: TaskPresentationState | null
    onConfirmSelection?: () => void
  }
  | {
    mode: 'compact'
    currentImageUrl: string | null | undefined
    isTaskRunning: boolean
    canGenerate: boolean
    generationCount: number
    onGenerationCountChange: (value: number) => void
    onGenerate: (count?: number) => void
  }

export default function LocationCardActions(props: LocationCardActionsProps) {
  const t = useTranslations('assets')

  if (props.mode === 'selection') {
    return (
      <>
        <div className="mt-3 text-xs text-[var(--glass-text-tertiary)] text-center">
          {t('image.selectTip')}
        </div>

        {props.selectedIndex !== null && props.onConfirmSelection && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={props.onConfirmSelection}
              disabled={props.isConfirmingSelection}
              className="px-4 py-2 text-sm bg-[var(--glass-tone-success-fg)] text-white rounded-lg hover:bg-[var(--glass-tone-success-fg)] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {props.isConfirmingSelection ? (
                <TaskStatusInline state={props.confirmingSelectionState} className="text-white [&>span]:text-white [&_svg]:text-white" />
              ) : (
                <>
                  <AppIcon name="check" className="w-4 h-4" />
                  {t('image.confirmOption', { number: props.selectedIndex + 1 })}
                  <span className="text-xs opacity-75">{t('image.deleteOthersHint')}</span>
                </>
              )}
            </button>
          </div>
        )}
      </>
    )
  }

  return (
    !props.currentImageUrl && !props.isTaskRunning && (
      <ImageGenerationInlineCountButton
        prefix={<span>{t('image.generateCountPrefix')}</span>}
        suffix={<span>{t('image.generateCountSuffix')}</span>}
        value={props.generationCount}
        options={getImageGenerationCountOptions('location')}
        onValueChange={props.onGenerationCountChange}
        onClick={() => props.onGenerate(props.generationCount)}
        disabled={!props.canGenerate}
        ariaLabel={t('image.selectCount')}
        className="glass-btn-base glass-btn-primary flex w-full items-center justify-center gap-1 py-1 text-xs disabled:opacity-50"
        selectClassName="appearance-none bg-transparent border-0 pl-0 pr-3 text-xs font-semibold text-current outline-none cursor-pointer leading-none transition-colors"
      />
    )
  )
}
