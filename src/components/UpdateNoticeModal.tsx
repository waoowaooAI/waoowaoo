'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'

export interface UpdateNoticeModalProps {
  show: boolean
  currentVersion: string
  latestVersion: string
  releaseUrl: string
  releaseName: string | null
  publishedAt: string | null
  onDismiss: () => void
}

export default function UpdateNoticeModal({
  show,
  currentVersion,
  latestVersion,
  releaseUrl,
  releaseName,
  publishedAt,
  onDismiss,
}: UpdateNoticeModalProps) {
  const t = useTranslations('common.updateNotice')
  const locale = useLocale()

  const formattedPublishedAt = useMemo(() => {
    if (!publishedAt) return null
    const parsed = new Date(publishedAt)
    if (Number.isNaN(parsed.getTime())) {
      return publishedAt
    }

    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(parsed)
  }, [locale, publishedAt])

  if (!show) return null

  return (
    <>
      <div className="fixed inset-0 z-[80] glass-overlay animate-fade-in" onClick={onDismiss} />
      <div className="fixed inset-0 z-[81] flex items-center justify-center p-4 pointer-events-none">
        <section
          className="glass-surface-modal w-full max-w-lg p-6 pointer-events-auto animate-scale-in"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--glass-tone-info-bg)]">
                <AppIcon name="sparkles" className="h-5 w-5 text-[var(--glass-tone-info-fg)]" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-[var(--glass-text-primary)]">{t('title')}</h3>
                <p className="mt-1 text-sm text-[var(--glass-text-secondary)]">
                  {t('subtitle', { current: currentVersion, latest: latestVersion })}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              className="glass-btn-base glass-btn-soft rounded-lg p-1.5 text-[var(--glass-text-tertiary)]"
              aria-label={t('close')}
            >
              <AppIcon name="close" className="h-4 w-4" />
            </button>
          </header>

          <p className="mt-4 text-sm leading-6 text-[var(--glass-text-secondary)]">{t('description')}</p>

          <div className="mt-4 space-y-2 rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-3.5">
            {releaseName ? (
              <div className="flex items-start justify-between gap-3 text-sm">
                <span className="text-[var(--glass-text-tertiary)]">{t('releaseName')}</span>
                <span className="text-right font-medium text-[var(--glass-text-primary)]">{releaseName}</span>
              </div>
            ) : null}
            {formattedPublishedAt ? (
              <div className="flex items-start justify-between gap-3 text-sm">
                <span className="text-[var(--glass-text-tertiary)]">{t('publishedAt')}</span>
                <span className="text-right text-[var(--glass-text-primary)]">{formattedPublishedAt}</span>
              </div>
            ) : null}
          </div>

          <footer className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onDismiss}
              className="glass-btn-base glass-btn-secondary rounded-xl px-4 py-2.5 text-sm font-medium"
            >
              {t('close')}
            </button>
            <Link
              href={releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="glass-btn-base glass-btn-primary inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium"
            >
              <AppIcon name="externalLink" className="h-4 w-4" />
              {t('viewRelease')}
            </Link>
          </footer>
        </section>
      </div>
    </>
  )
}
