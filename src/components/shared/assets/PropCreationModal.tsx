'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { useAssetActions } from '@/lib/query/hooks'
import { useImageGenerationCount } from '@/lib/image-generation/use-image-generation-count'
import ImageGenerationInlineCountButton from '@/components/image-generation/ImageGenerationInlineCountButton'
import { getImageGenerationCountOptions } from '@/lib/image-generation/count'

export interface PropCreationModalProps {
  mode: 'asset-hub' | 'project'
  folderId?: string | null
  projectId?: string
  onClose: () => void
  onSuccess: () => void
}

export function PropCreationModal({
  mode,
  folderId,
  projectId,
  onClose,
  onSuccess,
}: PropCreationModalProps) {
  const t = useTranslations('assetModal')
  const actions = useAssetActions({
    scope: mode === 'asset-hub' ? 'global' : 'project',
    projectId,
    kind: 'prop',
  })
  const { count, setCount } = useImageGenerationCount('location')
  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [artStyle, setArtStyle] = useState('american-comic')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingState = isSubmitting
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: 'generate',
      resource: 'image',
      hasOutput: false,
    })
    : null

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) {
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isSubmitting, onClose])

  const handleSubmit = async (generateAfterCreate: boolean) => {
    if (!name.trim() || !summary.trim() || !description.trim()) return
    try {
      setIsSubmitting(true)
      const result = await actions.create({
        name: name.trim(),
        summary: summary.trim(),
        description: description.trim(),
        folderId,
        ...(mode === 'asset-hub' ? { artStyle } : {}),
      }) as { assetId?: string }
      if (generateAfterCreate) {
        if (!result.assetId) {
          throw new Error('Missing assetId from create response')
        }
        await actions.generate({
          id: result.assetId,
          ...(mode === 'asset-hub' ? { artStyle } : {}),
          count,
        })
      }
      onSuccess()
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 glass-overlay flex items-center justify-center z-50 p-4">
      <div className="glass-surface-modal max-w-2xl w-full max-h-[85vh] flex flex-col">
        <div className="p-6 overflow-y-auto flex-1">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-[var(--glass-text-primary)]">
              {t('prop.title')}
            </h3>
            <button
              onClick={onClose}
              className="glass-btn-base glass-btn-soft w-8 h-8 rounded-full flex items-center justify-center text-[var(--glass-text-tertiary)]"
            >
              <AppIcon name="close" className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <label className="glass-field-label block">
                {t('prop.name')} <span className="text-[var(--glass-tone-danger-fg)]">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('prop.namePlaceholder')}
                className="glass-input-base w-full px-3 py-2 text-sm"
              />
            </div>

          <div className="space-y-2">
            <label className="glass-field-label block">
              {t('prop.summary')} <span className="text-[var(--glass-tone-danger-fg)]">*</span>
              </label>
              <textarea
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder={t('prop.summaryPlaceholder')}
                className="glass-textarea-base w-full h-36 px-3 py-2 text-sm resize-none"
              />
            </div>

            <div className="space-y-2">
              <label className="glass-field-label block">
                {t('prop.description')} <span className="text-[var(--glass-tone-danger-fg)]">*</span>
              </label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t('prop.descriptionPlaceholder')}
                className="glass-textarea-base w-full h-36 px-3 py-2 text-sm resize-none"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end p-4 border-t border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] rounded-b-xl flex-shrink-0">
          <button
            onClick={onClose}
            className="glass-btn-base glass-btn-secondary px-4 py-2 rounded-lg text-sm"
            disabled={isSubmitting}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={() => void handleSubmit(false)}
            disabled={isSubmitting || !name.trim() || !summary.trim() || !description.trim()}
            className="glass-btn-base glass-btn-secondary px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
          >
            {isSubmitting ? (
              <TaskStatusInline state={submittingState} className="text-white [&>span]:text-white [&_svg]:text-white" />
            ) : (
              <span>{mode === 'asset-hub' ? t('common.addOnlyToAssetHubProp') : t('common.addOnlyProp')}</span>
            )}
          </button>
          <ImageGenerationInlineCountButton
            prefix={<span>{t('common.addAndGeneratePrefix')}</span>}
            suffix={<span>{t('common.generateCountSuffix')}</span>}
            value={count}
            options={getImageGenerationCountOptions('location')}
            onValueChange={setCount}
            onClick={() => void handleSubmit(true)}
            actionDisabled={!name.trim() || !summary.trim() || !description.trim()}
            selectDisabled={isSubmitting}
            ariaLabel={t('common.selectGenerateCount')}
            className="glass-btn-base glass-btn-primary flex items-center justify-center gap-1 rounded-lg px-4 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            selectClassName="appearance-none bg-transparent border-0 pl-0 pr-3 text-sm font-semibold text-current outline-none cursor-pointer leading-none transition-colors"
          />
        </div>
      </div>
    </div>
  )
}
