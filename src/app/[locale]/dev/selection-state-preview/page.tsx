'use client'

import { useTranslations } from 'next-intl'
import { AppIcon, type AppIconName } from '@/components/ui/icons'

type PreviewItem = {
  key: string
  labelKey: 'apiConfig' | 'stylePresets' | 'billingRecords'
  icon: AppIconName
}

type SelectionVariant = {
  key: 'hoverOnly' | 'currentBlue' | 'pinnedHover' | 'raisedWhite' | 'inkOutline' | 'leftRail' | 'checkMark'
  className: string
  idleClassName: string
  marker?: 'dot' | 'check'
  darkIcon?: boolean
}

const previewItems: PreviewItem[] = [
  { key: 'apiConfig', labelKey: 'apiConfig', icon: 'settingsHexAlt' },
  { key: 'stylePresets', labelKey: 'stylePresets', icon: 'sparkles' },
  { key: 'billingRecords', labelKey: 'billingRecords', icon: 'receipt' },
]

const variants: SelectionVariant[] = [
  {
    key: 'hoverOnly',
    className: 'border-transparent bg-transparent text-[var(--glass-text-secondary)]',
    idleClassName: 'border-transparent text-[var(--glass-text-secondary)] hover:bg-[var(--glass-selection-hover-bg)] hover:text-[var(--glass-text-primary)]',
  },
  {
    key: 'currentBlue',
    className: 'border-transparent bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-[0_10px_24px_rgba(59,130,246,0.24)]',
    idleClassName: 'border-transparent text-[var(--glass-text-secondary)] hover:bg-blue-500/10 hover:text-blue-600',
  },
  {
    key: 'pinnedHover',
    className: 'border-transparent bg-[var(--glass-selection-hover-bg)] text-[var(--glass-text-primary)]',
    idleClassName: 'border-transparent text-[var(--glass-text-secondary)] hover:bg-[var(--glass-selection-hover-bg)] hover:text-[var(--glass-text-primary)]',
    darkIcon: true,
  },
  {
    key: 'raisedWhite',
    className: 'border-transparent bg-white/90 text-[var(--glass-text-primary)] shadow-[0_8px_22px_rgba(15,23,42,0.08)]',
    idleClassName: 'border-transparent text-[var(--glass-text-secondary)] hover:bg-white/80 hover:text-[var(--glass-text-primary)]',
    darkIcon: true,
  },
  {
    key: 'inkOutline',
    className: 'border-[rgba(17,24,39,0.16)] bg-white/50 text-[var(--glass-text-primary)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.7)]',
    idleClassName: 'border-transparent text-[var(--glass-text-secondary)] hover:border-[rgba(17,24,39,0.12)] hover:bg-white/50 hover:text-[var(--glass-text-primary)]',
    darkIcon: true,
  },
  {
    key: 'leftRail',
    className: 'border-transparent bg-white/50 text-[var(--glass-text-primary)]',
    idleClassName: 'border-transparent text-[var(--glass-text-secondary)] hover:bg-white/50 hover:text-[var(--glass-text-primary)]',
    marker: 'dot',
    darkIcon: true,
  },
  {
    key: 'checkMark',
    className: 'border-transparent bg-white/50 text-[var(--glass-text-primary)]',
    idleClassName: 'border-transparent text-[var(--glass-text-secondary)] hover:bg-white/50 hover:text-[var(--glass-text-primary)]',
    marker: 'check',
    darkIcon: true,
  },
]

export default function SelectionStatePreviewPage() {
  const t = useTranslations('selectionPreview')

  return (
    <main className="glass-page min-h-screen px-6 py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="space-y-2">
          <p className="text-sm font-semibold text-[var(--glass-text-tertiary)]">{t('eyebrow')}</p>
          <h1 className="text-2xl font-semibold text-[var(--glass-text-primary)]">{t('title')}</h1>
          <p className="max-w-3xl text-sm leading-6 text-[var(--glass-text-secondary)]">{t('description')}</p>
        </header>

        <section className="grid gap-5 lg:grid-cols-2">
          {variants.map((variant) => (
            <article key={variant.key} className="glass-surface-elevated p-5">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-[var(--glass-text-primary)]">{t(`variants.${variant.key}.name`)}</h2>
                <p className="mt-1 text-sm leading-5 text-[var(--glass-text-secondary)]">{t(`variants.${variant.key}.description`)}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-[1fr_240px]">
                <PreviewGroup
                  label={t('sidebarLabel')}
                  variant={variant}
                  shapeClassName="rounded-xl px-4 py-3"
                />
                <PreviewGroup
                  label={t('dropdownLabel')}
                  variant={variant}
                  shapeClassName="rounded-lg px-3 py-2.5"
                />
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  )
}

function PreviewGroup({
  label,
  variant,
  shapeClassName,
}: {
  label: string
  variant: SelectionVariant
  shapeClassName: string
}) {
  const t = useTranslations('selectionPreview')

  return (
    <div className="glass-surface-soft flex flex-col gap-2 border border-[var(--glass-stroke-base)] p-3">
      <p className="px-2 text-xs font-semibold text-[var(--glass-text-tertiary)]">{label}</p>
      {previewItems.map((item, index) => {
        const selected = index === 1
        return (
          <button
            key={item.key}
            type="button"
            className={`group relative flex cursor-pointer items-center gap-3 border text-left text-sm font-medium transition-all ${shapeClassName} ${selected ? variant.className : variant.idleClassName}`}
          >
            <AppIcon name={item.icon} className={`h-4 w-4 transition-transform group-hover:scale-105 ${selected && variant.darkIcon ? 'text-[var(--glass-text-primary)]' : ''}`} />
            <span>{t(`items.${item.labelKey}`)}</span>
            {selected && variant.marker === 'dot' ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--glass-text-primary)]" /> : null}
            {selected && variant.marker === 'check' ? <AppIcon name="check" className="ml-auto h-4 w-4 text-[var(--glass-text-primary)]" /> : null}
          </button>
        )
      })}
    </div>
  )
}
