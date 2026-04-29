'use client'
import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { useTranslations } from 'next-intl'
import { useCallback, useMemo, useState } from 'react'
import { AppIcon } from '@/components/ui/icons'
import ImageGenerationInlineCountButton from '@/components/image-generation/ImageGenerationInlineCountButton'
import { getImageGenerationCountOptions } from '@/lib/image-generation/count'
import { useImageGenerationCount } from '@/lib/image-generation/use-image-generation-count'
import { AI_EDIT_BUTTON_CLASS, AI_EDIT_ICON_CLASS } from '@/components/ui/ai-edit-style'
import AISparklesIcon from '@/components/ui/icons/AISparklesIcon'
import { useProjectAssets, useUploadProjectTempMedia } from '@/lib/query/hooks'
import ReferenceImageModal, {
  toReferenceImageNotePayload,
  type ReferenceImageNotePayload,
  type ReferenceImageOption,
  type ReferenceImageSource,
} from './ReferenceImageModal'

interface ImageSectionActionButtonsProps {
  projectId: string
  panelId: string
  imageUrl: string | null
  previousImageUrl?: string | null
  isSubmittingPanelImageTask: boolean
  isModifying: boolean
  referencePanelOptions?: Array<{
    panelId: string
    label: string
    imageUrl: string
  }>
  onRegeneratePanelImage: (
    panelId: string,
    count?: number,
    force?: boolean,
    referencePanelIds?: string[],
    extraImageUrls?: string[],
    referenceImageNotes?: ReferenceImageNotePayload[],
  ) => void
  onOpenEditModal: () => void
  onOpenAIDataModal: () => void
  onUndo?: (panelId: string) => void
  triggerPulse: () => void
}

export default function ImageSectionActionButtons({
  projectId,
  panelId,
  imageUrl,
  previousImageUrl,
  isSubmittingPanelImageTask,
  isModifying,
  referencePanelOptions = [],
  onRegeneratePanelImage,
  onOpenEditModal,
  onOpenAIDataModal,
  onUndo,
  triggerPulse,
}: ImageSectionActionButtonsProps) {
  const t = useTranslations('storyboard')
  const { count, setCount } = useImageGenerationCount('storyboard-candidates')
  const uploadTempMedia = useUploadProjectTempMedia()
  const { data: assets } = useProjectAssets(projectId)
  const [referenceImages, setReferenceImages] = useState<ReferenceImageOption[]>([])
  const [isReferencePanelOpen, setIsReferencePanelOpen] = useState(false)

  const createReferenceNote = useCallback((source: ReferenceImageSource, label: string) => {
    if (source === 'storyboard') return t('image.referenceDefaultStoryboard', { label })
    if (source === 'character') return t('image.referenceDefaultCharacter', { label })
    if (source === 'location') return t('image.referenceDefaultLocation', { label })
    if (source === 'prop') return t('image.referenceDefaultProp', { label })
    return t('image.referenceDefaultCustom', { label })
  }, [t])

  const panelReferenceOptions = useMemo<ReferenceImageOption[]>(() => (
    referencePanelOptions.map((option) => ({
      id: `storyboard:${option.panelId}`,
      source: 'storyboard',
      referencePanelId: option.panelId,
      label: option.label,
      imageUrl: option.imageUrl,
      note: createReferenceNote('storyboard', option.label),
    }))
  ), [createReferenceNote, referencePanelOptions])

  const assetReferenceOptions = useMemo<ReferenceImageOption[]>(() => {
    const options: ReferenceImageOption[] = []

    for (const character of assets?.characters ?? []) {
      for (const appearance of character.appearances ?? []) {
        if (!appearance.imageUrl) continue
        const label = appearance.changeReason
          ? `${character.name} · ${appearance.changeReason}`
          : character.name
        options.push({
          id: `character:${character.id}:${appearance.id || appearance.appearanceIndex}`,
          source: 'character',
          label,
          imageUrl: appearance.imageUrl,
          note: createReferenceNote('character', label),
        })
      }
    }

    for (const location of assets?.locations ?? []) {
      for (const image of location.images ?? []) {
        if (!image.imageUrl) continue
        const label = image.description
          ? `${location.name} · ${image.description}`
          : `${location.name} #${image.imageIndex + 1}`
        options.push({
          id: `location:${location.id}:${image.id || image.imageIndex}`,
          source: 'location',
          label,
          imageUrl: image.imageUrl,
          note: createReferenceNote('location', label),
        })
      }
    }

    for (const prop of assets?.props ?? []) {
      for (const image of prop.images ?? []) {
        if (!image.imageUrl) continue
        const label = image.description
          ? `${prop.name} · ${image.description}`
          : `${prop.name} #${image.imageIndex + 1}`
        options.push({
          id: `prop:${prop.id}:${image.id || image.imageIndex}`,
          source: 'prop',
          label,
          imageUrl: image.imageUrl,
          note: createReferenceNote('prop', label),
        })
      }
    }

    return options
  }, [assets?.characters, assets?.locations, assets?.props, createReferenceNote])

  const createUrlReference = useCallback((url: string): ReferenceImageOption | null => {
    const normalized = url.trim()
    if (!normalized) return null
    const label = normalized.length > 56 ? `${normalized.slice(0, 53)}...` : normalized
    return {
      id: `custom:${normalized}`,
      source: 'custom',
      label,
      imageUrl: normalized,
      note: createReferenceNote('custom', label),
    }
  }, [createReferenceNote])

  const uploadReferenceFile = useCallback(async (file: File): Promise<ReferenceImageOption> => {
    const imageBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (event) => resolve(String(event.target?.result || ''))
      reader.onerror = () => reject(reader.error || new Error('READ_FILE_FAILED'))
      reader.readAsDataURL(file)
    })
    const uploaded = await uploadTempMedia.mutateAsync({ imageBase64 })
    if (!uploaded.url) throw new Error('REFERENCE_IMAGE_UPLOAD_FAILED')
    const label = file.name || t('image.uploadReferenceImage')
    return {
      id: `custom:${uploaded.url}`,
      source: 'custom',
      label,
      imageUrl: uploaded.url,
      note: createReferenceNote('custom', label),
    }
  }, [createReferenceNote, t, uploadTempMedia])

  const selectedReferencePanelIds = referenceImages
    .filter((item) => item.source === 'storyboard' && item.referencePanelId)
    .map((item) => item.referencePanelId!)
  const extraImageUrls = referenceImages
    .filter((item) => item.source !== 'storyboard')
    .map((item) => item.imageUrl)
  const referenceImageNotes = [
    ...referenceImages.filter((item) => item.source === 'storyboard').map(toReferenceImageNotePayload),
    ...referenceImages.filter((item) => item.source !== 'storyboard').map(toReferenceImageNotePayload),
  ]

  return (
    <>
      <div className={`storyboard-image-actions absolute bottom-1.5 left-1/2 z-20 -translate-x-1/2 transition-opacity ${isSubmittingPanelImageTask ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        <div className="storyboard-image-actions__panel relative glass-surface-modal border border-[var(--glass-stroke-base)] rounded-lg p-0.5">
          <div className="storyboard-image-actions__row flex items-center gap-0.5">
            <ImageGenerationInlineCountButton
              prefix={
                <>
                  <AppIcon name="refresh" className="w-2.5 h-2.5" />
                  <span className="storyboard-image-actions__text">{isSubmittingPanelImageTask ? t('image.forceRegenerate') : t('panel.regenerate')}</span>
                </>
              }
              suffix={<span className="storyboard-image-actions__text">{t('image.generateCountSuffix')}</span>}
              value={count}
              options={getImageGenerationCountOptions('storyboard-candidates')}
              onValueChange={setCount}
              onClick={() => {
                _ulogInfo('[ImageSection] 🔄 左下角重新生成按钮被点击')
                _ulogInfo('[ImageSection] isSubmittingPanelImageTask:', isSubmittingPanelImageTask)
                _ulogInfo('[ImageSection] 将传递 force:', isSubmittingPanelImageTask)
                triggerPulse()
                onRegeneratePanelImage(panelId, count, isSubmittingPanelImageTask, selectedReferencePanelIds, extraImageUrls, referenceImageNotes)
              }}
              disabled={uploadTempMedia.isPending}
              ariaLabel={t('image.selectCount')}
              className={`storyboard-image-action-button glass-btn-base glass-btn-secondary flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] transition-all active:scale-95 ${isSubmittingPanelImageTask ? 'opacity-75' : ''}`}
              selectClassName="appearance-none bg-transparent border-0 pl-0 pr-3 text-[10px] font-semibold text-[var(--glass-text-primary)] outline-none cursor-pointer leading-none transition-colors"
              labelClassName="inline-flex items-center gap-0.5"
            />

            <div className="storyboard-image-actions__divider w-px h-3 bg-[var(--glass-stroke-base)]" />
            <button
              onClick={() => setIsReferencePanelOpen(true)}
              className={`storyboard-image-action-button glass-btn-base glass-btn-secondary relative flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] transition-all active:scale-95 ${referenceImages.length > 0 ? 'text-[var(--glass-tone-info-fg)]' : ''}`}
              title={t('image.referenceImages')}
            >
              <AppIcon name="imageEdit" className="w-2.5 h-2.5" />
              <span className="storyboard-image-actions__text">{t('image.referenceImages')}</span>
              {referenceImages.length > 0 && (
                <span className="storyboard-image-reference-count ml-0.5 rounded-full bg-[var(--glass-tone-info-bg)] px-1 text-[9px] leading-3 text-[var(--glass-tone-info-fg)]">
                  {referenceImages.length}
                </span>
              )}
            </button>

            <div className="storyboard-image-actions__divider w-px h-3 bg-[var(--glass-stroke-base)]" />

            <button
              onClick={onOpenAIDataModal}
              className={`storyboard-image-action-button glass-btn-base glass-btn-secondary flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] transition-all active:scale-95 ${isSubmittingPanelImageTask || isModifying ? 'opacity-75' : ''}`}
              title={t('aiData.viewData')}
            >
              <AppIcon name="chart" className="w-2.5 h-2.5" />
              <span className="storyboard-image-actions__text">{t('aiData.viewData')}</span>
            </button>
            {imageUrl && (
              <button
                onClick={onOpenEditModal}
                className={`storyboard-image-action-button glass-btn-base h-6 w-6 rounded-full flex items-center justify-center transition-all active:scale-95 ${AI_EDIT_BUTTON_CLASS} ${isSubmittingPanelImageTask || isModifying ? 'opacity-75' : ''}`}
                title={t('image.editImage')}
              >
                <AISparklesIcon className={`w-2.5 h-2.5 ${AI_EDIT_ICON_CLASS}`} />
              </button>
            )}

            {previousImageUrl && onUndo && (
              <>
                <div className="storyboard-image-actions__divider w-px h-3 bg-[var(--glass-stroke-base)]" />
                <button
                  onClick={() => onUndo(panelId)}
                  disabled={isSubmittingPanelImageTask}
                  className="storyboard-image-action-button glass-btn-base glass-btn-secondary flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] transition-all active:scale-95 disabled:opacity-50"
                  title={t('assets.image.undo')}
                >
                  <AppIcon name="undo" className="w-2.5 h-2.5" />
                  <span className="storyboard-image-actions__text">{t('assets.image.undo')}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      <ReferenceImageModal
        isOpen={isReferencePanelOpen}
        panelOptions={panelReferenceOptions}
        assetOptions={assetReferenceOptions}
        selectedItems={referenceImages}
        isUploading={uploadTempMedia.isPending}
        onClose={() => setIsReferencePanelOpen(false)}
        onChange={setReferenceImages}
        onUploadFile={uploadReferenceFile}
        onCreateUrlReference={createUrlReference}
      />
    </>
  )
}
