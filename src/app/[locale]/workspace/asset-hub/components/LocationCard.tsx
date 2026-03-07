'use client'
import { resolveErrorDisplay } from '@/lib/errors/display'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  useGenerateLocationImage,
  useSelectLocationImage,
  useUndoLocationImage,
  useUploadLocationImage,
  useDeleteLocation
} from '@/lib/query/mutations'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import TaskStatusOverlay from '@/components/task/TaskStatusOverlay'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import ImageGenerationInlineCountButton from '@/components/image-generation/ImageGenerationInlineCountButton'
import ImageGenerationSlotOverlay from '@/components/image-generation/ImageGenerationSlotOverlay'
import { getImageGenerationCountOptions } from '@/lib/image-generation/count'
import { useImageGenerationCount } from '@/lib/image-generation/use-image-generation-count'
import {
  countGeneratedImageSlots,
  resolveImageSlotPhase,
  shouldShowImageSlotGrid,
} from '@/lib/image-generation/slot-state'
import { AppIcon } from '@/components/ui/icons'

interface LocationImage {
  id: string
  imageIndex: number
  description: string | null
  imageUrl: string | null
  previousImageUrl: string | null
  isSelected: boolean
  imageTaskRunning: boolean
  imageErrorMessage?: string | null
  lastError?: { code: string; message: string } | null
}

interface Location {
  id: string
  name: string
  summary: string | null
  artStyle?: string | null
  folderId: string | null
  images: LocationImage[]
}

interface LocationCardProps {
  location: Location
  onImageClick?: (url: string) => void
  onImageEdit?: (type: 'character' | 'location', id: string, name: string, imageIndex: number) => void
  onEdit?: (location: Location, imageIndex: number) => void
}

export function LocationCard({ location, onImageClick, onImageEdit, onEdit }: LocationCardProps) {
  // 🔥 使用 mutation hooks
  const generateImage = useGenerateLocationImage()
  const selectImage = useSelectLocationImage()
  const undoImage = useUndoLocationImage()
  const uploadImage = useUploadLocationImage()
  const deleteLocation = useDeleteLocation()

  const t = useTranslations('assetHub')
  const tAssets = useTranslations('assets')
  const { count: generationCount, setCount: setGenerationCount } = useImageGenerationCount('location')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const latestSelectRequestRef = useRef(0)

  // 解析图片
  const orderedImages = [...(location.images || [])].sort((left, right) => left.imageIndex - right.imageIndex)
  const imagesWithUrl = orderedImages.filter((img) => img.imageUrl)
  const totalImageCount = orderedImages.length
  const generatedImageCount = countGeneratedImageSlots(orderedImages)
  const hasAnyImageError = orderedImages.some((img) => !!(img.lastError || img.imageErrorMessage))
  const hasMultipleImages = totalImageCount > 1
  const selectedImage = orderedImages.find((img) => img.isSelected)
  const serverSelectedIndex = selectedImage?.imageIndex ?? null
  const effectiveSelectedIndex = serverSelectedIndex
  const currentImageUrl = selectedImage?.imageUrl || imagesWithUrl[0]?.imageUrl || null
  const currentImageIndex = effectiveSelectedIndex ?? imagesWithUrl[0]?.imageIndex ?? 0
  const hasPreviousVersion = location.images?.some(img => img.previousImageUrl) || false

  const isValidUrl = (url: string | null | undefined): boolean => {
    if (!url || url.trim() === '') return false
    if (url.startsWith('/')) return true
    if (url.startsWith('data:') || url.startsWith('blob:')) return true
    try { new URL(url); return true } catch { return false }
  }
  const displayImageUrl = isValidUrl(currentImageUrl) ? currentImageUrl : null
  const serverTaskRunning = (location.images || []).some((image) => image.imageTaskRunning)
  const transientSubmitting = generateImage.isPending
  const isTaskRunning = serverTaskRunning || transientSubmitting
  const displayTaskPresentation = isTaskRunning
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: displayImageUrl ? 'process' : 'generate',
      resource: 'image',
      hasOutput: !!displayImageUrl,
    })
    : null
  // 取第一个有错误的 image 的 lastError
  const firstImageError = !isTaskRunning
    ? (location.images || []).find(img => img.lastError)?.lastError || null
    : null
  const taskErrorDisplay = firstImageError ? resolveErrorDisplay(firstImageError) : null
  const selectImageRunningState = selectImage.isPending
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: 'process',
      resource: 'image',
      hasOutput: !!displayImageUrl,
    })
    : null

  // 生成图片
  const handleGenerate = (count = generationCount) => {
    generateImage.mutate({
      locationId: location.id,
      artStyle: location.artStyle || undefined,
      count,
    }, {
      onError: (error) => alert(error.message || t('generateFailed'))
    })
  }

  // 选择图片（依赖 query 缓存乐观更新）
  const handleSelectImage = (imageIndex: number | null) => {
    if (imageIndex === effectiveSelectedIndex) return
    const requestId = latestSelectRequestRef.current + 1
    latestSelectRequestRef.current = requestId
    selectImage.mutate({
      locationId: location.id,
      imageIndex,
      confirm: false
    }, {
      onError: (error) => {
        if (latestSelectRequestRef.current !== requestId) return
        alert(error.message || t('selectFailed'))
      }
    })
  }

  // 确认选择
  const handleConfirmSelection = () => {
    if (effectiveSelectedIndex === null) return
    const requestId = latestSelectRequestRef.current + 1
    latestSelectRequestRef.current = requestId
    selectImage.mutate({
      locationId: location.id,
      imageIndex: effectiveSelectedIndex,
      confirm: true
    }, {
      onError: (error) => {
        if (latestSelectRequestRef.current !== requestId) return
        alert(error.message || t('selectFailed'))
      }
    })
  }

  // 撤回
  const handleUndo = () => {
    undoImage.mutate(location.id)
  }

  // 上传图片
  const handleUpload = () => {
    const file = fileInputRef.current?.files?.[0]
    if (!file) return

    uploadImage.mutate(
      {
        file,
        locationId: location.id,
        labelText: location.name,
        imageIndex: currentImageIndex
      },
      {
        onError: (error) => alert(error.message || t('uploadFailed')),
        onSettled: () => {
          if (fileInputRef.current) fileInputRef.current.value = ''
        }
      }
    )
  }

  // 删除场景
  const handleDelete = () => {
    deleteLocation.mutate(location.id, {
      onSettled: () => setShowDeleteConfirm(false)
    })
  }

  // 多图选择模式
  if (shouldShowImageSlotGrid({
    totalSlotCount: totalImageCount,
    generatedCount: generatedImageCount,
    hasRunningTask: isTaskRunning,
    hasAnyError: hasAnyImageError,
  })) {
    const selectionStatusText = isTaskRunning || generatedImageCount < totalImageCount
      ? tAssets('image.generatedProgress', { generated: generatedImageCount, total: totalImageCount })
      : effectiveSelectedIndex !== null
        ? tAssets('image.optionSelected', { number: effectiveSelectedIndex + 1 })
        : tAssets('image.selectFirst')

    return (
      <div className="col-span-3 glass-surface p-4 relative">
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />

        {/* 顶部：名字 + 操作 */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-[var(--glass-text-primary)]">{location.name}</span>
            </div>
            {location.summary && (
              <div className="text-xs text-[var(--glass-text-secondary)] mb-1 line-clamp-2" title={location.summary}>
                {location.summary}
              </div>
            )}
          <div className="text-xs text-[var(--glass-text-tertiary)]">{selectionStatusText}</div>
        </div>
          <div className="flex items-center gap-1 ml-2">
            <ImageGenerationInlineCountButton
              prefix={isTaskRunning ? (
                <TaskStatusInline state={displayTaskPresentation} className="[&_span]:sr-only [&_svg]:text-[var(--glass-tone-info-fg)]" />
              ) : (
                <AppIcon name="refresh" className="w-4 h-4 text-[var(--glass-tone-info-fg)]" />
              )}
              suffix={null}
              value={generationCount}
              options={getImageGenerationCountOptions('location')}
              onValueChange={setGenerationCount}
              onClick={() => handleGenerate(generationCount)}
              disabled={isTaskRunning}
              ariaLabel={tAssets('image.selectCount')}
              className="inline-flex h-6 items-center gap-0.5 rounded px-1 hover:bg-[var(--glass-tone-info-bg)] transition-colors disabled:opacity-50"
              selectClassName="appearance-none bg-transparent border-0 pl-0 pr-3 text-[10px] font-semibold text-[var(--glass-tone-info-fg)] outline-none cursor-pointer leading-none transition-colors"
            />
            {hasPreviousVersion && (
              <button onClick={handleUndo} className="glass-btn-base glass-btn-soft h-6 w-6 rounded-md" title={tAssets('image.undo')}>
                <AppIcon name="sparkles" className="w-4 h-4 text-[var(--glass-tone-warning-fg)]" />
              </button>
            )}
            <button onClick={() => setShowDeleteConfirm(true)} className="glass-btn-base glass-btn-soft h-6 w-6 rounded-md">
              <AppIcon name="trash" className="w-4 h-4 text-[var(--glass-tone-danger-fg)]" />
            </button>
          </div>
        </div>

        {/* 任务失败错误提示 */}
        {taskErrorDisplay && !isTaskRunning && (
          <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-[var(--glass-danger-ring)] text-[var(--glass-tone-danger-fg)]">
            <AppIcon name="alert" className="w-4 h-4 shrink-0" />
            <span className="text-xs line-clamp-2">{taskErrorDisplay.message}</span>
          </div>
        )}

        {/* 图片列表 */}
        <div className="grid grid-cols-3 gap-3">
          {orderedImages.map((img) => {
            const isThisSelected = img.isSelected
            const phase = resolveImageSlotPhase({ imageUrl: img.imageUrl }, isTaskRunning || !!img.imageTaskRunning)
            const imageError = resolveErrorDisplay(img.lastError || {
              code: img.imageErrorMessage || null,
              message: img.imageErrorMessage || null,
            })
            return (
              <div key={img.id} className="relative group/thumb">
                <div
                  onClick={() => {
                    if (img.imageUrl) {
                      onImageClick?.(img.imageUrl)
                    }
                  }}
                  className={`rounded-lg overflow-hidden border-2 transition-all ${img.imageUrl ? 'cursor-zoom-in' : 'cursor-default'} ${isThisSelected ? 'border-[var(--glass-stroke-success)] ring-2 ring-[var(--glass-success-ring)]' : 'border-[var(--glass-stroke-base)] hover:border-[var(--glass-stroke-focus)]'}`}
                >
                  {img.imageUrl ? (
                    <MediaImageWithLoading
                      src={img.imageUrl}
                      alt={`${location.name} ${img.imageIndex + 1}`}
                      containerClassName="w-full min-h-[88px]"
                      className="w-full h-auto object-contain"
                    />
                  ) : (
                    <div className="flex min-h-[88px] items-center justify-center bg-[var(--glass-bg-muted)]">
                      {imageError && !isTaskRunning ? (
                        <div className="flex flex-col items-center justify-center px-3 py-6 text-center">
                          <AppIcon name="alert" className="mb-2 h-6 w-6 text-[var(--glass-tone-danger-fg)]" />
                          <span className="text-xs font-medium text-[var(--glass-tone-danger-fg)]">{tAssets('common.generateFailed')}</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-2 px-3 py-6 text-[var(--glass-text-tertiary)]">
                          <div className="h-12 w-12 animate-pulse rounded-xl bg-[var(--glass-bg-surface-strong)]" />
                          <span className="text-xs">{tAssets('image.generatingPlaceholder')}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {phase === 'generating' && (
                    <ImageGenerationSlotOverlay label={tAssets('image.generating')} />
                  )}
                  {phase === 'regenerating' && (
                    <ImageGenerationSlotOverlay label={tAssets('image.regenerating')} />
                  )}
                  <div className={`absolute bottom-2 left-2 text-xs px-2 py-0.5 rounded ${isThisSelected ? 'glass-chip glass-chip-success' : 'glass-chip glass-chip-neutral'}`}>
                    {tAssets('image.optionNumber', { number: img.imageIndex + 1 })}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!img.imageUrl || phase === 'generating' || phase === 'regenerating') return
                    handleSelectImage(isThisSelected ? null : img.imageIndex)
                  }}
                  disabled={!img.imageUrl || phase === 'generating' || phase === 'regenerating'}
                  className={`absolute top-2 right-2 glass-btn-base h-7 w-7 rounded-full ${isThisSelected ? 'glass-btn-tone-success' : 'glass-btn-secondary'} disabled:opacity-50`}
                >
                  <AppIcon name="check" className="w-4 h-4" />
                </button>
              </div>
            )
          })}
        </div>

        {/* 确认按钮 */}
        {effectiveSelectedIndex !== null && (
          <div className="mt-4 flex justify-end">
            <button onClick={handleConfirmSelection} disabled={selectImage.isPending} className="glass-btn-base glass-btn-tone-success px-4 py-2 rounded-lg flex items-center gap-2 text-sm">
              {selectImage.isPending ? (
                <TaskStatusInline state={selectImageRunningState} className="text-white [&>span]:sr-only [&_svg]:text-white" />
              ) : (
                <AppIcon name="check" className="w-4 h-4" />
              )}
              {tAssets('image.confirmOption', { number: effectiveSelectedIndex + 1 })}
            </button>
          </div>
        )}

        {/* 删除确认 */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 glass-overlay flex items-center justify-center z-20 rounded-xl">
            <div className="glass-surface-modal p-4 m-4">
              <p className="mb-4 text-sm text-[var(--glass-text-primary)]">{t('confirmDeleteLocation')}</p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowDeleteConfirm(false)} className="glass-btn-base glass-btn-secondary px-3 py-1.5 rounded-lg text-sm">{t('cancel')}</button>
                <button onClick={handleDelete} className="glass-btn-base glass-btn-danger px-3 py-1.5 rounded-lg text-sm">{t('delete')}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // 单图模式
  return (
    <div className="glass-surface overflow-hidden relative group">
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />

      {/* 图片区域 */}
      <div className="relative bg-[var(--glass-bg-muted)] min-h-[100px]">
        {displayImageUrl ? (
          <>
            <MediaImageWithLoading
              src={displayImageUrl}
              alt={location.name}
              containerClassName="w-full min-h-[120px]"
              className="w-full h-auto object-contain cursor-zoom-in"
              onClick={() => onImageClick?.(displayImageUrl)}
            />
            {/* 操作按钮 - 非生成时显示 */}
            {!isTaskRunning && (
              <div className="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => fileInputRef.current?.click()} disabled={uploadImage.isPending} className="glass-btn-base glass-btn-secondary h-7 w-7 rounded-full">
                  <AppIcon name="upload" className="w-4 h-4 text-[var(--glass-tone-success-fg)]" />
                </button>
                <button onClick={() => onImageEdit?.('location', location.id, location.name, currentImageIndex)} className="glass-btn-base glass-btn-tone-info h-7 w-7 rounded-full">
                  <AppIcon name="edit" className="w-4 h-4" />
                </button>
                <button onClick={() => handleGenerate()} className="glass-btn-base glass-btn-secondary h-7 w-7 rounded-full">
                  <AppIcon name="refresh" className="w-4 h-4 text-[var(--glass-tone-info-fg)]" />
                </button>
                {hasPreviousVersion && (
                  <button onClick={handleUndo} className="glass-btn-base glass-btn-secondary h-7 w-7 rounded-full">
                    <AppIcon name="sparkles" className="w-4 h-4 text-[var(--glass-tone-warning-fg)]" />
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--glass-text-tertiary)]">
            <AppIcon name="globe2" className="w-12 h-12 mb-3" />
            <ImageGenerationInlineCountButton
              prefix={<span>{tAssets('image.generateCountPrefix')}</span>}
              suffix={<span>{tAssets('image.generateCountSuffix')}</span>}
              value={generationCount}
              options={getImageGenerationCountOptions('location')}
              onValueChange={setGenerationCount}
              onClick={() => handleGenerate(generationCount)}
              ariaLabel={tAssets('image.selectCount')}
              className="glass-btn-base glass-btn-primary flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg"
              selectClassName="appearance-none bg-transparent border-0 pl-0 pr-3 text-sm font-semibold text-current outline-none cursor-pointer leading-none transition-colors"
            />
          </div>
        )}
        {isTaskRunning && (
          <TaskStatusOverlay state={displayTaskPresentation} />
        )}
        {taskErrorDisplay && !isTaskRunning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--glass-danger-ring)] text-[var(--glass-tone-danger-fg)] p-3 gap-1">
            <AppIcon name="alert" className="w-6 h-6" />
            <span className="text-xs text-center font-medium line-clamp-3">{taskErrorDisplay.message}</span>
          </div>
        )}
      </div>

      {/* 信息区域 */}
      <div className="p-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-[var(--glass-text-primary)] text-sm truncate">{location.name}</h3>
          <div className="flex items-center gap-1">
            {/* 编辑按钮 */}
            <button
              onClick={() => onEdit?.(location, currentImageIndex)}
              className="glass-btn-base glass-btn-soft h-6 w-6 rounded-md opacity-0 group-hover:opacity-100"
              title={tAssets('video.panelCard.editPrompt')}
            >
              <AppIcon name="edit" className="w-4 h-4 text-[var(--glass-text-secondary)]" />
            </button>
            {/* 删除按钮 */}
            <button onClick={() => setShowDeleteConfirm(true)} className="glass-btn-base glass-btn-soft h-6 w-6 rounded-md text-[var(--glass-tone-danger-fg)] opacity-0 group-hover:opacity-100">
              <AppIcon name="trash" className="w-4 h-4" />
            </button>
          </div>
        </div>
        {location.summary && <p className="mt-1 text-xs text-[var(--glass-text-secondary)] line-clamp-2">{location.summary}</p>}
      </div>

      {/* 删除确认 */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 glass-overlay flex items-center justify-center z-20">
          <div className="glass-surface-modal p-4 m-4">
            <p className="mb-4 text-sm text-[var(--glass-text-primary)]">{t('confirmDeleteLocation')}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowDeleteConfirm(false)} className="glass-btn-base glass-btn-secondary px-3 py-1.5 rounded-lg text-sm">{t('cancel')}</button>
              <button onClick={handleDelete} className="glass-btn-base glass-btn-danger px-3 py-1.5 rounded-lg text-sm">{t('delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LocationCard
