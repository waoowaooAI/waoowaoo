'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { resolveErrorDisplay } from '@/lib/errors/display'
import TaskStatusOverlay from '@/components/task/TaskStatusOverlay'
import type { TaskPresentationState } from '@/lib/task/presentation'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { AppIcon } from '@/components/ui/icons'
import ImageGenerationSlotOverlay from '@/components/image-generation/ImageGenerationSlotOverlay'
import {
  countGeneratedImageSlots,
  resolveGroupedImageSlotPhase,
} from '@/lib/image-generation/slot-state'

type SelectionImage = {
  id: string
  imageIndex: number
  imageUrl: string | null
  isSelected?: boolean
  lastError?: { code: string; message: string } | null
  imageErrorMessage?: string | null
}

type LocationImageListProps =
  | {
    mode: 'selection'
    locationId: string
    locationName: string
    images: SelectionImage[]
    selectedImageId?: string | null
    selectedIndex: number | null
    isGroupTaskRunning: boolean
    isImageTaskRunning: (imageIndex: number) => boolean
    displayTaskPresentation: TaskPresentationState | null
    onImageClick: (imageUrl: string) => void
    onSelectImage?: (locationId: string, imageIndex: number | null) => void
  }
  | {
    mode: 'single'
    locationName: string
    aspectClassName: string
    currentImageUrl: string | null | undefined
    selectedIndex: number | null
    hasMultipleImages: boolean
    isTaskRunning: boolean
    displayTaskPresentation: TaskPresentationState | null
    imageErrorMessage?: string | null
    onImageClick: (imageUrl: string) => void
    overlayActions: ReactNode
  }

export default function LocationImageList(props: LocationImageListProps) {
  const t = useTranslations('assets')

  if (props.mode === 'selection') {
    const generatedCount = countGeneratedImageSlots(props.images)
    const hasPendingEmptySlots = props.isGroupTaskRunning && generatedCount < props.images.length

    return (
      <div className="grid grid-cols-3 gap-3">
        {props.images.map((img) => {
          const isThisSelected = props.selectedImageId
            ? img.id === props.selectedImageId
            : img.isSelected
          const slotTaskRunning =
            props.isImageTaskRunning(img.imageIndex) ||
            (props.isGroupTaskRunning && !img.imageUrl)
          const phase = resolveGroupedImageSlotPhase(
            { imageUrl: img.imageUrl },
            {
              isGroupRunning: props.isGroupTaskRunning,
              isSlotRunning: slotTaskRunning,
              hasPendingEmptySlots,
            },
          )
          const imageError = resolveErrorDisplay(img.lastError || {
            code: img.imageErrorMessage || null,
            message: img.imageErrorMessage || null,
          })
          return (
            <div key={img.id} className="relative group/thumb">
              <div
                onClick={() => {
                  if (img.imageUrl) {
                    props.onImageClick(img.imageUrl)
                  }
                }}
                className={`rounded-lg overflow-hidden border-2 transition-all relative ${img.imageUrl ? 'cursor-pointer' : 'cursor-default'} ${isThisSelected
                  ? 'border-[var(--glass-stroke-success)] ring-2 ring-[var(--glass-focus-ring)]'
                  : 'border-[var(--glass-stroke-base)] hover:border-[var(--glass-stroke-focus)]'
                  }`}
              >
                {img.imageUrl ? (
                  <MediaImageWithLoading
                    src={img.imageUrl}
                    alt={t('image.optionAlt', { name: props.locationName, number: img.imageIndex + 1 })}
                    containerClassName="w-full min-h-[88px]"
                    className="w-full h-auto object-contain"
                  />
                ) : (
                  <div className="flex min-h-[88px] items-center justify-center bg-[var(--glass-bg-muted)]">
                    {imageError && phase !== 'generating' && phase !== 'regenerating' ? (
                      <div className="flex flex-col items-center justify-center px-3 py-6 text-center">
                        <AppIcon name="alert" className="mb-2 h-6 w-6 text-[var(--glass-tone-danger-fg)]" />
                        <span className="text-xs font-medium text-[var(--glass-tone-danger-fg)]">{t('common.generateFailed')}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2 px-3 py-6 text-[var(--glass-text-tertiary)]">
                        <div className="h-12 w-12 animate-pulse rounded-xl bg-[var(--glass-bg-surface-strong)]" />
                        <span className="text-xs">{t('image.generatingPlaceholder')}</span>
                      </div>
                    )}
                  </div>
                )}

                {phase === 'generating' && (
                  <ImageGenerationSlotOverlay label={t('image.generating')} />
                )}

                {phase === 'regenerating' && (
                  <ImageGenerationSlotOverlay label={t('image.regenerating')} />
                )}

                <div
                  className={`absolute bottom-2 left-2 flex items-center gap-1 text-white text-xs px-2 py-0.5 rounded ${isThisSelected ? 'bg-[var(--glass-tone-success-fg)]' : 'bg-[var(--glass-overlay)]'
                    }`}
                >
                  <span>{t('image.optionNumber', { number: img.imageIndex + 1 })}</span>
                  {isThisSelected && (
                    <AppIcon name="checkTiny" className="h-3 w-3" />
                  )}
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (phase !== 'generating' && phase !== 'regenerating' && img.imageUrl) {
                      props.onSelectImage?.(props.locationId, isThisSelected ? null : img.imageIndex)
                    }
                  }}
                  disabled={phase === 'generating' || phase === 'regenerating' || !img.imageUrl}
                  className={`absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center transition-all shadow-sm ${isThisSelected
                    ? 'bg-[var(--glass-tone-success-fg)] text-white'
                    : 'bg-[var(--glass-bg-surface-strong)] hover:bg-[var(--glass-accent-from)] hover:text-white'
                    } disabled:opacity-50`}
                  title={isThisSelected ? t('image.cancelSelection') : t('image.useThis')}
                >
                  <AppIcon name="check" className="w-4 h-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const locationErrorDisplay = resolveErrorDisplay({
    code: props.imageErrorMessage || null,
    message: props.imageErrorMessage || null,
  })

  return (
    <div className={`relative overflow-hidden rounded-lg border-2 border-[var(--glass-stroke-base)] ${props.aspectClassName}`}>
      {props.currentImageUrl ? (
        <div className="relative h-full w-full">
          <MediaImageWithLoading
            src={props.currentImageUrl}
            alt={props.locationName}
            containerClassName="h-full w-full"
            className="h-full w-full object-contain cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => props.onImageClick(props.currentImageUrl!)}
          />
          {props.selectedIndex !== null && props.hasMultipleImages && (
            <div className="absolute bottom-2 left-2 bg-[var(--glass-tone-success-fg)] text-white text-xs px-2 py-0.5 rounded">
              {t('image.optionNumber', { number: props.selectedIndex + 1 })}
            </div>
          )}
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[var(--glass-bg-muted)]">
          {locationErrorDisplay && !props.isTaskRunning ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <AppIcon name="alert" className="w-8 h-8 text-[var(--glass-tone-danger-fg)] mb-2" />
              <div className="text-[var(--glass-tone-danger-fg)] text-xs font-medium mb-1">{t('common.generateFailed')}</div>
              <div className="text-[var(--glass-tone-danger-fg)] text-xs max-w-full break-words">{locationErrorDisplay.message}</div>
            </div>
          ) : (
            <AppIcon name="image" className="w-8 h-8 text-[var(--glass-text-tertiary)]" />
          )}
        </div>
      )}
      {props.isTaskRunning && (
        <TaskStatusOverlay state={props.displayTaskPresentation} />
      )}
      {!props.isTaskRunning && (
        <div className="absolute top-2 left-2 flex gap-1">
          {props.overlayActions}
        </div>
      )}
    </div>
  )
}
