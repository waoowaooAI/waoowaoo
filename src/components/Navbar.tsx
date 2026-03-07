'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import LanguageSwitcher from './LanguageSwitcher'
import { AppIcon } from '@/components/ui/icons'
import UpdateNoticeModal from './UpdateNoticeModal'
import { useGithubReleaseUpdate } from '@/hooks/common/useGithubReleaseUpdate'
import { Link } from '@/i18n/navigation'


export default function Navbar() {
  const { data: session, status } = useSession()
  const t = useTranslations('nav')
  const tc = useTranslations('common')
  const { currentVersion, update, shouldPulse, showModal, isChecking, openModal, dismissCurrentUpdate, checkNow } = useGithubReleaseUpdate()
  const [checkMsg, setCheckMsg] = useState<string | null>(null)
  const [checkMsgFading, setCheckMsgFading] = useState(false)
  const [manualChecking, setManualChecking] = useState(false)

  const handleCheckUpdate = async () => {
    setCheckMsg(null)
    setCheckMsgFading(false)
    setManualChecking(true)
    const minSpin = new Promise(r => setTimeout(r, 1000))
    await Promise.all([checkNow(), minSpin])
    setManualChecking(false)
    setTimeout(() => {
      setCheckMsg('upToDate')
      setTimeout(() => setCheckMsgFading(true), 2000)
      setTimeout(() => { setCheckMsg(null); setCheckMsgFading(false) }, 3000)
    }, 100)
  }

  return (
    <>
      <nav className="glass-nav sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <Link href={{ pathname: session ? '/workspace' : '/' }} className="group">
                <Image
                  src="/logo-small.png?v=1"
                  alt={tc('appName')}
                  width={80}
                  height={80}
                  className="object-contain transition-transform group-hover:scale-110"
                />
              </Link>
              <button
                type="button"
                onClick={openModal}
                disabled={!update}
                className={`relative inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.02em] transition-all ${update
                  ? 'border-[var(--glass-tone-warning-fg)]/40 bg-[linear-gradient(135deg,var(--glass-tone-warning-bg),var(--glass-bg-surface-strong))] text-[var(--glass-tone-warning-fg)] shadow-[0_8px_24px_-16px_rgba(245,158,11,0.9)] hover:brightness-105'
                  : 'border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] text-[var(--glass-text-secondary)] hover:border-[var(--glass-stroke-focus)] hover:text-[var(--glass-text-primary)] disabled:cursor-default'
                  }`}
                aria-label={tc('updateNotice.openDialog')}
              >
                <span className="inline-flex items-center gap-1.5">
                  <AppIcon name="sparkles" className="h-3.5 w-3.5" />
                  {tc('betaVersion', { version: currentVersion })}
                  {update ? (
                    <span className="relative inline-flex items-center">
                      {shouldPulse ? <span className="absolute -inset-1.5 animate-ping rounded-full bg-[var(--glass-tone-warning-fg)] opacity-20" /> : null}
                      <span className="relative inline-flex items-center gap-1 rounded-full bg-[var(--glass-tone-warning-fg)]/16 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]">
                        <AppIcon name="upload" className="h-3 w-3" />
                        {tc('updateNotice.updateTag')}
                      </span>
                    </span>
                  ) : null}
                </span>
              </button>
              <button
                type="button"
                onClick={() => void handleCheckUpdate()}
                disabled={manualChecking}
                className="rounded-full p-1.5 text-[var(--glass-text-tertiary)] hover:bg-[var(--glass-bg-muted)] hover:text-[var(--glass-text-secondary)] transition-colors disabled:opacity-40"
                title={tc('updateNotice.checkUpdate')}
              >
                <AppIcon name="refresh" className={`h-3.5 w-3.5 ${manualChecking ? 'animate-spin' : ''}`} />
              </button>
              {checkMsg === 'upToDate' && !update && (
                <span
                  className="text-[11px] text-[var(--glass-tone-success-fg)] font-medium transition-opacity duration-1000"
                  style={{ opacity: checkMsgFading ? 0 : 1 }}
                >
                  ✓ {tc('updateNotice.upToDate')}
                </span>
              )}
            </div>
            <div className="flex items-center space-x-6">
              {status === 'loading' ? (
                /* Session 加载中骨架屏 */
                <div className="flex items-center space-x-4">
                  <div className="h-4 w-16 rounded-full bg-[var(--glass-bg-muted)] animate-pulse" />
                  <div className="h-4 w-16 rounded-full bg-[var(--glass-bg-muted)] animate-pulse" />
                  <div className="h-8 w-20 rounded-lg bg-[var(--glass-bg-muted)] animate-pulse" />
                </div>
              ) : session ? (
                <>
                  <a
                    href="https://www.waoowaoo.com/community.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs sm:text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] font-medium transition-colors flex items-center gap-1"
                  >
                    <AppIcon name="usersRound" className="w-4 h-4" />
                    {t('feedback')}
                  </a>
                  <Link
                    href={{ pathname: '/workspace' }}
                    className="text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] font-medium transition-colors flex items-center gap-1"
                  >
                    <AppIcon name="monitor" className="w-4 h-4" />
                    {t('workspace')}
                  </Link>
                  <Link
                    href={{ pathname: '/workspace/asset-hub' }}
                    className="text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] font-medium transition-colors flex items-center gap-1"
                  >
                    <AppIcon name="folderHeart" className="w-4 h-4" />
                    {t('assetHub')}
                  </Link>
                  <Link
                    href={{ pathname: '/profile' }}
                    className="text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] font-medium transition-colors flex items-center gap-1"
                    title={t('profile')}
                  >
                    <AppIcon name="userRoundCog" className="w-5 h-5" />
                    {t('profile')}
                  </Link>
                  <LanguageSwitcher />
                </>

              ) : (
                <>
                  <Link
                    href={{ pathname: '/auth/signin' }}
                    className="text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] font-medium transition-colors"
                  >
                    {t('signin')}
                  </Link>
                  <Link
                    href={{ pathname: '/auth/signup' }}
                    className="glass-btn-base glass-btn-primary px-4 py-2 text-sm font-medium"
                  >
                    {t('signup')}
                  </Link>
                  <LanguageSwitcher />
                </>
              )}
            </div>
          </div>
        </div>
      </nav>
      {update ? (
        <UpdateNoticeModal
          show={showModal}
          currentVersion={currentVersion}
          latestVersion={update.latestVersion}
          releaseUrl={update.releaseUrl}
          releaseName={update.releaseName}
          publishedAt={update.publishedAt}
          onDismiss={dismissCurrentUpdate}
        />
      ) : null}
    </>
  )
}
