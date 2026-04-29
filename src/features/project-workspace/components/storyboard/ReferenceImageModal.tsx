'use client'

import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import GlassButton from '@/components/ui/primitives/GlassButton'
import GlassInput from '@/components/ui/primitives/GlassInput'
import GlassTextarea from '@/components/ui/primitives/GlassTextarea'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { toDisplayImageUrl } from '@/lib/media/image-url'
import { lockModalPageScroll } from './modal-scroll-lock'

export type ReferenceImageSource = 'storyboard' | 'character' | 'location' | 'prop' | 'custom'

export interface ReferenceImageOption {
  id: string
  source: ReferenceImageSource
  label: string
  imageUrl: string
  note: string
  referencePanelId?: string
}

export interface ReferenceImageNotePayload {
  source: ReferenceImageSource
  label: string
  instruction: string
  url?: string
  referencePanelId?: string
}

interface ReferenceImageModalProps {
  isOpen: boolean
  panelOptions: ReferenceImageOption[]
  assetOptions: ReferenceImageOption[]
  selectedItems: ReferenceImageOption[]
  isUploading: boolean
  onClose: () => void
  onChange: (items: ReferenceImageOption[]) => void
  onUploadFile: (file: File) => Promise<ReferenceImageOption>
  onCreateUrlReference: (url: string) => ReferenceImageOption | null
}

type ReferenceTab = 'storyboard' | 'assets' | 'custom'

function sourceIcon(source: ReferenceImageSource) {
  if (source === 'storyboard') return 'clapperboard'
  if (source === 'character') return 'user'
  if (source === 'location') return 'imageAlt'
  if (source === 'prop') return 'package'
  return 'imageEdit'
}

function SourceChip({ source }: { source: ReferenceImageSource }) {
  const t = useTranslations('storyboard')
  return (
    <span className="inline-flex items-center gap-1 rounded-[var(--glass-radius-xs)] bg-[var(--glass-bg-muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--glass-text-tertiary)]">
      <AppIcon name={sourceIcon(source)} className="h-3 w-3" />
      {t(`image.referenceSource.${source}`)}
    </span>
  )
}

function ReferenceGrid({
  items,
  selectedIds,
  emptyLabel,
  onToggle,
}: {
  items: ReferenceImageOption[]
  selectedIds: Set<string>
  emptyLabel: string
  onToggle: (item: ReferenceImageOption) => void
}) {
  if (items.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center rounded-[var(--glass-radius-sm)] border border-dashed border-[var(--glass-stroke-base)] text-[var(--glass-text-tertiary)]">
        <AppIcon name="imagePreview" className="mb-2 h-7 w-7" />
        <span className="text-xs">{emptyLabel}</span>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item) => {
        const isSelected = selectedIds.has(item.id)
        const displayUrl = toDisplayImageUrl(item.imageUrl)
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onToggle(item)}
            className={[
              'group relative overflow-hidden rounded-[var(--glass-radius-xs)] border text-left transition-all',
              isSelected
                ? 'border-[var(--glass-stroke-focus)] bg-[var(--glass-tone-info-bg)]'
                : 'border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] hover:border-[var(--glass-stroke-focus)]',
            ].join(' ')}
          >
            <div className="aspect-[4/3] bg-[var(--glass-bg-surface)]">
              {displayUrl ? (
                <MediaImageWithLoading
                  src={displayUrl}
                  alt={item.label}
                  containerClassName="h-full w-full"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[var(--glass-text-tertiary)]">
                  <AppIcon name={sourceIcon(item.source)} className="h-7 w-7" />
                </div>
              )}
            </div>
            <div className="space-y-1 p-2">
              <SourceChip source={item.source} />
              <p className="line-clamp-2 text-[11px] font-medium leading-snug text-[var(--glass-text-secondary)]">
                {item.label}
              </p>
            </div>
            {isSelected && (
              <div className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--glass-accent-from)] text-white">
                <AppIcon name="checkXs" className="h-3 w-3" />
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function toReferenceImageNotePayload(item: ReferenceImageOption): ReferenceImageNotePayload {
  return {
    source: item.source,
    label: item.label,
    instruction: item.note,
    ...(item.source === 'storyboard' && item.referencePanelId ? { referencePanelId: item.referencePanelId } : {}),
    ...(item.source !== 'storyboard' ? { url: item.imageUrl } : {}),
  }
}

export default function ReferenceImageModal({
  isOpen,
  panelOptions,
  assetOptions,
  selectedItems,
  isUploading,
  onClose,
  onChange,
  onUploadFile,
  onCreateUrlReference,
}: ReferenceImageModalProps) {
  const t = useTranslations('storyboard')
  const [activeTab, setActiveTab] = useState<ReferenceTab>('storyboard')
  const [urlDraft, setUrlDraft] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const selectedIds = useMemo(() => new Set(selectedItems.map((item) => item.id)), [selectedItems])

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return undefined
    return lockModalPageScroll(document)
  }, [isOpen])

  if (!isOpen || typeof document === 'undefined') return null

  const toggleItem = (item: ReferenceImageOption) => {
    if (selectedIds.has(item.id)) {
      onChange(selectedItems.filter((selected) => selected.id !== item.id))
      return
    }
    onChange([...selectedItems, item].slice(0, 8))
  }

  const addUrlReference = (rawValue: string) => {
    const created = rawValue
      .split(/\s+/)
      .map((url) => onCreateUrlReference(url))
      .filter((item): item is ReferenceImageOption => Boolean(item))
    if (created.length === 0) return
    const next = [...selectedItems]
    for (const item of created) {
      if (!next.some((selected) => selected.id === item.id)) {
        next.push(item)
      }
    }
    onChange(next.slice(0, 8))
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'))
    event.target.value = ''
    if (files.length === 0) return
    void Promise.all(files.slice(0, Math.max(0, 8 - selectedItems.length)).map(onUploadFile)).then((created) => {
      const next = [...selectedItems]
      for (const item of created) {
        if (!next.some((selected) => selected.id === item.id)) {
          next.push(item)
        }
      }
      onChange(next.slice(0, 8))
    })
  }

  const handlePaste = (event: ClipboardEvent) => {
    const imageFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file))

    if (imageFiles.length > 0) {
      event.preventDefault()
      void Promise.all(imageFiles.slice(0, Math.max(0, 8 - selectedItems.length)).map(onUploadFile)).then((created) => {
        const next = [...selectedItems]
        for (const item of created) {
          if (!next.some((selected) => selected.id === item.id)) {
            next.push(item)
          }
        }
        onChange(next.slice(0, 8))
      })
      return
    }

    const text = event.clipboardData.getData('text/plain')
    if (text) addUrlReference(text)
  }

  const updateSelectedNote = (id: string, note: string) => {
    onChange(selectedItems.map((item) => item.id === id ? { ...item, note } : item))
  }

  const removeSelected = (id: string) => {
    onChange(selectedItems.filter((item) => item.id !== id))
  }

  const tabButtonClass = (tab: ReferenceTab) => [
    'inline-flex items-center gap-1.5 rounded-[var(--glass-radius-xs)] px-3 py-1.5 text-xs font-semibold transition-colors',
    activeTab === tab
      ? 'bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]'
      : 'text-[var(--glass-text-tertiary)] hover:bg-[var(--glass-bg-muted)] hover:text-[var(--glass-text-secondary)]',
  ].join(' ')

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="glass-overlay absolute inset-0" onClick={onClose} />
      <div
        className="relative z-10 glass-surface-modal flex w-full max-w-[960px] flex-col overflow-hidden"
        style={{ maxHeight: '92vh' }}
        onPaste={handlePaste}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-[var(--glass-stroke-base)] px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[var(--glass-radius-xs)] bg-[var(--glass-tone-info-bg)]">
              <AppIcon name="imageEdit" className="h-3.5 w-3.5 text-[var(--glass-tone-info-fg)]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold leading-none text-[var(--glass-text-primary)]">
                {t('image.referenceImages')}
              </h2>
              <p className="mt-0.5 text-[11px] text-[var(--glass-text-tertiary)]">
                {t('image.referenceImagesHint')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="glass-btn-base glass-btn-ghost h-7 w-7 flex-shrink-0"
            aria-label={t('common.cancel')}
          >
            <AppIcon name="close" className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="w-[58%] overflow-y-auto border-r border-[var(--glass-stroke-base)] p-5">
            <div className="mb-4 flex flex-wrap gap-2">
              <button type="button" className={tabButtonClass('storyboard')} onClick={() => setActiveTab('storyboard')}>
                <AppIcon name="clapperboard" className="h-3.5 w-3.5" />
                {t('image.referenceTabStoryboard')}
              </button>
              <button type="button" className={tabButtonClass('assets')} onClick={() => setActiveTab('assets')}>
                <AppIcon name="folderCards" className="h-3.5 w-3.5" />
                {t('image.referenceTabAssets')}
              </button>
              <button type="button" className={tabButtonClass('custom')} onClick={() => setActiveTab('custom')}>
                <AppIcon name="imageEdit" className="h-3.5 w-3.5" />
                {t('image.referenceTabCustom')}
              </button>
            </div>

            {activeTab === 'storyboard' && (
              <ReferenceGrid
                items={panelOptions}
                selectedIds={selectedIds}
                emptyLabel={t('image.noReferencePanel')}
                onToggle={toggleItem}
              />
            )}

            {activeTab === 'assets' && (
              <ReferenceGrid
                items={assetOptions}
                selectedIds={selectedIds}
                emptyLabel={t('image.noReferenceAssets')}
                onToggle={toggleItem}
              />
            )}

            {activeTab === 'custom' && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <GlassInput
                    value={urlDraft}
                    onChange={(event) => setUrlDraft(event.target.value)}
                    placeholder={t('image.referenceImageUrlPlaceholder')}
                    className="min-w-0 flex-1"
                  />
                  <GlassButton
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      addUrlReference(urlDraft)
                      setUrlDraft('')
                    }}
                  >
                    {t('image.addReferenceImageUrl')}
                  </GlassButton>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || selectedItems.length >= 8}
                  className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-[var(--glass-radius-sm)] border border-dashed border-[var(--glass-stroke-strong)] text-[var(--glass-text-tertiary)] transition-colors hover:border-[var(--glass-stroke-focus)] hover:text-[var(--glass-tone-info-fg)] disabled:opacity-50"
                >
                  <AppIcon name={isUploading ? 'refresh' : 'plus'} className={`h-7 w-7 ${isUploading ? 'animate-spin' : ''}`} />
                  <span className="text-xs font-medium">{t('image.uploadReferenceImage')}</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex w-[42%] flex-col overflow-hidden bg-[var(--glass-bg-muted)]">
            <div className="flex flex-shrink-0 items-center justify-between border-b border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-4 py-2.5">
              <div className="flex items-center gap-2">
                <AppIcon name="fileText" className="h-3.5 w-3.5 text-[var(--glass-tone-info-fg)]" />
                <span className="text-xs font-medium text-[var(--glass-text-tertiary)]">
                  {t('image.referenceUsageTitle', { count: selectedItems.length })}
                </span>
              </div>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {selectedItems.length === 0 ? (
                <div className="flex h-full min-h-40 flex-col items-center justify-center text-center text-[var(--glass-text-tertiary)]">
                  <AppIcon name="imagePreview" className="mb-2 h-8 w-8" />
                  <p className="text-xs">{t('image.referenceEmptySelection')}</p>
                </div>
              ) : (
                selectedItems.map((item, index) => (
                  <div key={item.id} className="rounded-[var(--glass-radius-sm)] border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-3">
                    <div className="mb-2 flex items-start gap-3">
                      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-[var(--glass-radius-xs)] bg-[var(--glass-bg-muted)]">
                        <MediaImageWithLoading
                          src={toDisplayImageUrl(item.imageUrl) || item.imageUrl}
                          alt={item.label}
                          containerClassName="h-full w-full"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-[10px] font-semibold text-[var(--glass-tone-info-fg)]">#{index + 1}</span>
                          <SourceChip source={item.source} />
                        </div>
                        <p className="line-clamp-2 text-xs font-semibold text-[var(--glass-text-primary)]">{item.label}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSelected(item.id)}
                        className="glass-btn-base glass-btn-ghost h-7 w-7 flex-shrink-0"
                        aria-label={t('common.remove')}
                      >
                        <AppIcon name="closeSm" className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <GlassTextarea
                      rows={3}
                      value={item.note}
                      onChange={(event) => updateSelectedNote(item.id, event.target.value)}
                      placeholder={t('image.referenceUsagePlaceholder')}
                      density="compact"
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center justify-between border-t border-[var(--glass-stroke-base)] px-5 py-3">
          <p className="text-[11px] text-[var(--glass-text-tertiary)]">
            {t('image.referencePromptHint')}
          </p>
          <GlassButton
            variant="primary"
            size="sm"
            onClick={onClose}
            iconLeft={<AppIcon name="check" className="h-3.5 w-3.5" />}
          >
            {t('common.confirm')}
          </GlassButton>
        </div>
      </div>
    </div>,
    document.body,
  )
}
