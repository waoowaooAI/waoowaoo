'use client'
import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { useTranslations } from 'next-intl'
import { useCallback, useRef, useState } from 'react'
import { AppIcon } from '@/components/ui/icons'
import ImageGenerationInlineCountButton from '@/components/image-generation/ImageGenerationInlineCountButton'
import { getImageGenerationCountOptions } from '@/lib/image-generation/count'
import { useImageGenerationCount } from '@/lib/image-generation/use-image-generation-count'
import { AI_EDIT_BUTTON_CLASS, AI_EDIT_ICON_CLASS } from '@/components/ui/ai-edit-style'
import AISparklesIcon from '@/components/ui/icons/AISparklesIcon'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { useUploadProjectTempMedia } from '@/lib/query/hooks'

interface ImageSectionActionButtonsProps {
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
  onRegeneratePanelImage: (panelId: string, count?: number, force?: boolean, referencePanelIds?: string[], extraImageUrls?: string[]) => void
  onOpenEditModal: () => void
  onOpenAIDataModal: () => void
  onUndo?: (panelId: string) => void
  triggerPulse: () => void
}

export default function ImageSectionActionButtons({
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
  const [selectedReferencePanelId, setSelectedReferencePanelId] = useState('')
  const [referenceImageUrls, setReferenceImageUrls] = useState<string[]>([])
  const [referenceUrlDraft, setReferenceUrlDraft] = useState('')
  const [isReferencePanelOpen, setIsReferencePanelOpen] = useState(false)
  const selectedReferencePanelIds = selectedReferencePanelId ? [selectedReferencePanelId] : []
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addReferenceUrls = useCallback((urls: string[]) => {
    const normalizedUrls = urls.map((url) => url.trim()).filter(Boolean)
    if (normalizedUrls.length === 0) return
    setReferenceImageUrls((previous) => {
      const next = [...previous]
      for (const normalized of normalizedUrls) {
        if (!next.includes(normalized)) {
          next.push(normalized)
        }
      }
      return next.slice(0, 8)
    })
  }, [])

  const addReferenceUrl = useCallback((url: string) => {
    addReferenceUrls(url.split(/\s+/))
  }, [addReferenceUrls])

  const uploadReferenceFile = useCallback(async (file: File) => {
    const imageBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (event) => resolve(String(event.target?.result || ''))
      reader.onerror = () => reject(reader.error || new Error('READ_FILE_FAILED'))
      reader.readAsDataURL(file)
    })
    const uploaded = await uploadTempMedia.mutateAsync({ imageBase64 })
    if (!uploaded.url) throw new Error('REFERENCE_IMAGE_UPLOAD_FAILED')
    addReferenceUrl(uploaded.url)
  }, [addReferenceUrl, uploadTempMedia])

  const handleReferenceFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'))
    event.target.value = ''
    if (files.length === 0) return
    void Promise.all(files.slice(0, Math.max(0, 8 - referenceImageUrls.length)).map(uploadReferenceFile))
  }, [referenceImageUrls.length, uploadReferenceFile])

  const handleReferencePaste = useCallback((event: React.ClipboardEvent) => {
    const imageFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => !!file)
    if (imageFiles.length > 0) {
      event.preventDefault()
      void Promise.all(imageFiles.slice(0, Math.max(0, 8 - referenceImageUrls.length)).map(uploadReferenceFile))
      return
    }
    const text = event.clipboardData.getData('text/plain')
    if (text) {
      addReferenceUrl(text)
    }
  }, [addReferenceUrl, referenceImageUrls.length, uploadReferenceFile])

  const removeReferenceImage = useCallback((index: number) => {
    setReferenceImageUrls((previous) => previous.filter((_, imageIndex) => imageIndex !== index))
  }, [])

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
                onRegeneratePanelImage(panelId, count, isSubmittingPanelImageTask, selectedReferencePanelIds, referenceImageUrls)
              }}
              disabled={uploadTempMedia.isPending}
              ariaLabel={t('image.selectCount')}
              className={`storyboard-image-action-button glass-btn-base glass-btn-secondary flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] transition-all active:scale-95 ${isSubmittingPanelImageTask ? 'opacity-75' : ''}`}
              selectClassName="appearance-none bg-transparent border-0 pl-0 pr-3 text-[10px] font-semibold text-[var(--glass-text-primary)] outline-none cursor-pointer leading-none transition-colors"
              labelClassName="inline-flex items-center gap-0.5"
            />

            {referencePanelOptions.length > 0 && (
              <>
                <div className="storyboard-image-actions__divider w-px h-3 bg-[var(--glass-stroke-base)]" />
                <label
                  className={`storyboard-image-reference-label storyboard-image-action-button glass-btn-base glass-btn-secondary relative inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] transition-all active:scale-95 ${selectedReferencePanelId ? 'text-[var(--glass-tone-info-fg)]' : 'text-[var(--glass-text-secondary)]'}`}
                  title={t('image.referencePanel')}
                >
                  <AppIcon name="imagePreview" className="storyboard-image-reference-icon w-2.5 h-2.5" />
                  <select
                    value={selectedReferencePanelId}
                    onChange={(event) => setSelectedReferencePanelId(event.target.value)}
                    className="storyboard-image-reference-select max-w-[6.5rem] appearance-none bg-transparent text-[10px] outline-none cursor-pointer"
                    title={t('image.referencePanel')}
                    aria-label={t('image.referencePanel')}
                  >
                    <option value="">{t('image.noReferencePanel')}</option>
                    {referencePanelOptions.map((option) => (
                      <option key={option.panelId} value={option.panelId}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            <div className="storyboard-image-actions__divider w-px h-3 bg-[var(--glass-stroke-base)]" />
            <button
              onClick={() => setIsReferencePanelOpen(true)}
              className={`storyboard-image-action-button glass-btn-base glass-btn-secondary relative flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] transition-all active:scale-95 ${referenceImageUrls.length > 0 ? 'text-[var(--glass-tone-info-fg)]' : ''}`}
              title={t('image.referenceImages')}
            >
              <AppIcon name="imageEdit" className="w-2.5 h-2.5" />
              <span className="storyboard-image-actions__text">{t('image.referenceImages')}</span>
              {referenceImageUrls.length > 0 && (
                <span className="storyboard-image-reference-count ml-0.5 rounded-full bg-[var(--glass-tone-info-bg)] px-1 text-[9px] leading-3 text-[var(--glass-tone-info-fg)]">
                  {referenceImageUrls.length}
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
      {isReferencePanelOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[var(--glass-overlay)] p-4">
          <div
            className="w-full max-w-lg rounded-xl bg-[var(--glass-bg-surface)] shadow-2xl"
            onPaste={handleReferencePaste}
          >
            <div className="border-b border-[var(--glass-stroke-base)] p-4">
              <h3 className="text-base font-semibold text-[var(--glass-text-primary)]">{t('image.referenceImages')}</h3>
              <p className="mt-1 text-xs text-[var(--glass-text-tertiary)]">{t('image.referenceImagesHint')}</p>
            </div>
            <div className="space-y-4 p-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleReferenceFileChange}
                className="hidden"
              />
              <div className="flex gap-2">
                <input
                  value={referenceUrlDraft}
                  onChange={(event) => setReferenceUrlDraft(event.target.value)}
                  placeholder={t('image.referenceImageUrlPlaceholder')}
                  className="min-w-0 flex-1 rounded-lg border border-[var(--glass-stroke-strong)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--glass-stroke-focus)]"
                />
                <button
                  onClick={() => {
                    addReferenceUrl(referenceUrlDraft)
                    setReferenceUrlDraft('')
                  }}
                  className="glass-btn-base glass-btn-secondary rounded-lg px-3 py-2 text-sm"
                >
                  {t('image.addReferenceImageUrl')}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {referenceImageUrls.map((url, index) => (
                  <div key={`${url}-${index}`} className="relative h-16 w-16">
                    <MediaImageWithLoading
                      src={url}
                      alt=""
                      containerClassName="h-full w-full rounded-lg"
                      className="h-full w-full rounded-lg object-cover"
                    />
                    <button
                      onClick={() => removeReferenceImage(index)}
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--glass-tone-danger-fg)] text-white"
                    >
                      <AppIcon name="closeSm" className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadTempMedia.isPending || referenceImageUrls.length >= 8}
                  className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-[var(--glass-stroke-strong)] text-[var(--glass-text-tertiary)] transition-colors hover:border-[var(--glass-stroke-focus)] hover:text-[var(--glass-tone-info-fg)] disabled:opacity-50"
                  title={t('image.uploadReferenceImage')}
                >
                  <AppIcon name={uploadTempMedia.isPending ? 'refresh' : 'plus'} className={`h-6 w-6 ${uploadTempMedia.isPending ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--glass-stroke-base)] p-4">
              <button
                onClick={() => setIsReferencePanelOpen(false)}
                className="glass-btn-base glass-btn-primary rounded-lg px-4 py-2 text-sm"
              >
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
