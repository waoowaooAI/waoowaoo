'use client'
import { useTranslations } from 'next-intl'

interface PanelVariantModalCustomOptionsProps {
  customInput: string
  includeCharacterAssets: boolean
  includeLocationAsset: boolean
  isSubmittingVariantTask: boolean
  onCustomInputChange: (value: string) => void
  onIncludeCharacterAssetsChange: (checked: boolean) => void
  onIncludeLocationAssetChange: (checked: boolean) => void
}

export default function PanelVariantModalCustomOptions({
  customInput,
  includeCharacterAssets,
  includeLocationAsset,
  isSubmittingVariantTask,
  onCustomInputChange,
  onIncludeCharacterAssetsChange,
  onIncludeLocationAssetChange,
}: PanelVariantModalCustomOptionsProps) {
  const t = useTranslations('storyboard')

  return (
    <>
      <div>
        <h3 className="text-sm font-medium text-[var(--glass-text-primary)] mb-2">{t('variant.customInstruction')}</h3>
        <textarea
          value={customInput}
          onChange={(event) => onCustomInputChange(event.target.value)}
          placeholder={t('variant.customPlaceholder')}
          className="glass-textarea-base h-16 px-3 py-2 text-sm resize-none"
          disabled={isSubmittingVariantTask}
        />
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-[var(--glass-text-secondary)] cursor-pointer">
          <input
            type="checkbox"
            checked={includeCharacterAssets}
            onChange={(event) => onIncludeCharacterAssetsChange(event.target.checked)}
            className="w-4 h-4 accent-[var(--glass-accent-from)] rounded"
          />
          {t('variant.includeCharacter')}
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--glass-text-secondary)] cursor-pointer">
          <input
            type="checkbox"
            checked={includeLocationAsset}
            onChange={(event) => onIncludeLocationAssetChange(event.target.checked)}
            className="w-4 h-4 accent-[var(--glass-accent-from)] rounded"
          />
          {t('variant.includeLocation')}
        </label>
      </div>
    </>
  )
}
