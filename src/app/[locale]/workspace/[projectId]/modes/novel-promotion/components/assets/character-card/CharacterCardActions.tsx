'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import type { TaskPresentationState } from '@/lib/task/presentation'
import { AppIcon } from '@/components/ui/icons'
import ImageGenerationInlineCountButton from '@/components/image-generation/ImageGenerationInlineCountButton'
import { getImageGenerationCountOptions } from '@/lib/image-generation/count'

type CharacterCardActionsProps =
  | {
    mode: 'selection'
    selectedIndex: number | null
    isConfirmingSelection: boolean
    confirmSelectionState: TaskPresentationState | null
    onConfirmSelection?: () => void
    isPrimaryAppearance: boolean
    voiceSettings: ReactNode
  }
  | {
    mode: 'compact'
    isPrimaryAppearance: boolean
    primaryAppearanceSelected: boolean
    currentImageUrl: string | null | undefined
    isAppearanceTaskRunning: boolean
    isAnyTaskRunning: boolean
    hasDescription: boolean
    generationCount: number
    onGenerationCountChange: (value: number) => void
    onGenerate: (count?: number) => void
    voiceSettings: ReactNode
  }

export default function CharacterCardActions(props: CharacterCardActionsProps) {
  const t = useTranslations('assets')

  if (props.mode === 'selection') {
    return (
      <>
        <div className="mt-3 text-xs text-[var(--glass-text-tertiary)] text-center">
          {t('image.selectTip')}
        </div>

        {props.selectedIndex !== null && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={props.onConfirmSelection}
              disabled={props.isConfirmingSelection}
              className="px-4 py-2 bg-[var(--glass-tone-success-fg)] text-white rounded-lg hover:bg-[var(--glass-tone-success-fg)] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium"
            >
              {props.isConfirmingSelection ? (
                <TaskStatusInline state={props.confirmSelectionState} className="text-white [&>span]:text-white [&_svg]:text-white" />
              ) : (
                <>
                  <AppIcon name="check" className="w-4 h-4" />
                  {t('image.confirmOption', { number: props.selectedIndex + 1 })}
                </>
              )}
            </button>
          </div>
        )}

        {props.isPrimaryAppearance && props.voiceSettings}
      </>
    )
  }

  return (
    <>
      {!props.isPrimaryAppearance && !props.primaryAppearanceSelected ? (
        <div className="w-full py-2 text-xs text-center text-[var(--glass-text-tertiary)] bg-[var(--glass-bg-muted)] rounded border border-dashed border-[var(--glass-stroke-strong)]">
          <div className="flex items-center justify-center gap-1">
            <AppIcon name="lock" className="w-3 h-3" />
            {t('character.selectPrimaryFirst')}
          </div>
        </div>
      ) : (
        !props.currentImageUrl && !props.isAppearanceTaskRunning && !props.isAnyTaskRunning && (
          <ImageGenerationInlineCountButton
            prefix={<span>{props.isPrimaryAppearance ? t('image.generateCountPrefix') : t('character.generateFromPrimary')}</span>}
            suffix={<span>{t('image.generateCountSuffix')}</span>}
            value={props.generationCount}
            options={getImageGenerationCountOptions('character')}
            onValueChange={props.onGenerationCountChange}
            onClick={() => props.onGenerate(props.generationCount)}
            disabled={!props.hasDescription}
            ariaLabel={t('image.selectCount')}
            className={`glass-btn-base flex w-full items-center justify-center gap-1 py-1 text-xs disabled:opacity-50 ${props.isPrimaryAppearance ? 'glass-btn-primary' : 'glass-btn-tone-info'}`}
            selectClassName="appearance-none bg-transparent border-0 pl-0 pr-3 text-xs font-semibold text-current outline-none cursor-pointer leading-none transition-colors"
          />
        )
      )}

      {props.isPrimaryAppearance && props.voiceSettings}
    </>
  )
}
