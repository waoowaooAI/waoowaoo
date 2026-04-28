'use client'

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import LanguageSwitcher from './LanguageSwitcher'
import { AppIcon, type AppIconName } from '@/components/ui/icons'
import UpdateNoticeModal from './UpdateNoticeModal'
import { useGithubReleaseUpdate } from '@/hooks/common/useGithubReleaseUpdate'
import { Link } from '@/i18n/navigation'
import { buildAuthenticatedHomeTarget } from '@/lib/home/default-route'
import type { ProfileSection } from '@/lib/profile/sections'


export default function Navbar() {
  const { data: session, status } = useSession()
  const t = useTranslations('nav')
  const tc = useTranslations('common')
  const { currentVersion, update, shouldPulse, showModal, openModal, dismissCurrentUpdate, checkNow } = useGithubReleaseUpdate()
  const [checkMsg, setCheckMsg] = useState<string | null>(null)
  const [checkMsgFading, setCheckMsgFading] = useState(false)
  const [manualChecking, setManualChecking] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsMenuStyle, setSettingsMenuStyle] = useState<CSSProperties | null>(null)
  const settingsTriggerRef = useRef<HTMLDivElement>(null)
  const settingsMenuRef = useRef<HTMLDivElement>(null)
  const downloadLogsHref = '/api/admin/download-logs'
  const settingsMenuId = 'navbar-settings-menu'
  const navControlClass = 'glass-selection-control flex items-center gap-1 rounded-full px-2.5 py-1.5 text-sm font-medium'

  const settingsMenuItems: Array<{
    section: ProfileSection
    icon: AppIconName
    label: string
  }> = [
    { section: 'apiConfig', icon: 'settingsHexAlt', label: t('settingsMenu.apiConfig') },
    { section: 'stylePresets', icon: 'sparkles', label: t('settingsMenu.stylePresets') },
    { section: 'billing', icon: 'receipt', label: t('settingsMenu.billingRecords') },
  ]

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

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!settingsOpen) return

    const updatePosition = () => {
      const trigger = settingsTriggerRef.current
      if (!trigger) return

      const rect = trigger.getBoundingClientRect()
      const width = 240
      const viewportPadding = 16
      const maxLeft = Math.max(viewportPadding, window.innerWidth - width - viewportPadding)
      const left = Math.min(Math.max(viewportPadding, rect.right - width), maxLeft)

      setSettingsMenuStyle({
        position: 'fixed',
        top: rect.bottom + 8,
        left,
        width,
      })
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (settingsTriggerRef.current?.contains(target)) return
      if (settingsMenuRef.current?.contains(target)) return
      setSettingsOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSettingsOpen(false)
      }
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [settingsOpen])

  const settingsMenu = (
    <div
      id={settingsMenuId}
      ref={settingsMenuRef}
      role="menu"
      aria-label={t('profile')}
      style={settingsMenuStyle ?? undefined}
      className="z-[1000] rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] p-2 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.55)] backdrop-blur-xl"
    >
      {settingsMenuItems.map(item => (
        <Link
          key={item.section}
          href={{ pathname: '/profile', query: { section: item.section } }}
          role="menuitem"
          onClick={() => setSettingsOpen(false)}
          className="glass-selection-control group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium"
        >
          <AppIcon name={item.icon} className="h-4 w-4 transition-transform group-hover:scale-110" />
          <span>{item.label}</span>
        </Link>
      ))}
    </div>
  )

  return (
    <>
      <nav className="glass-nav sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <Link href={session ? buildAuthenticatedHomeTarget() : { pathname: '/' }} className="group">
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
                  <Link
                    href={{ pathname: '/workspace' }}
                    className={navControlClass}
                  >
                    <AppIcon name="monitor" className="w-4 h-4" />
                    {t('workspace')}
                  </Link>
                  <Link
                    href={{ pathname: '/workspace/asset-hub' }}
                    className={navControlClass}
                  >
                    <AppIcon name="folderHeart" className="w-4 h-4" />
                    {t('assetHub')}
                  </Link>
                  <div ref={settingsTriggerRef} className="relative">
                    <button
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={settingsOpen}
                      aria-controls={settingsMenuId}
                      onClick={() => setSettingsOpen(open => !open)}
                      className={navControlClass}
                      title={t('profile')}
                    >
                      <AppIcon name="userRoundCog" className="w-5 h-5" />
                      {t('profile')}
                      <AppIcon name="chevronDown" className={`h-3.5 w-3.5 transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                  {!mounted ? (
                    <div className="hidden" aria-hidden="true">
                      {settingsMenuItems.map(item => (
                        <Link
                          key={item.section}
                          href={{ pathname: '/profile', query: { section: item.section } }}
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                  <LanguageSwitcher />
                  <a
                    href={downloadLogsHref}
                    download
                    className={navControlClass}
                    title={t('downloadLogs')}
                  >
                    <AppIcon name="download" className="w-4 h-4" />
                    {t('downloadLogs')}
                  </a>
                </>

              ) : (
                <>
                  <Link
                    href={{ pathname: '/auth/signin' }}
                    className="glass-selection-control rounded-full px-2.5 py-1.5 text-sm font-medium"
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
      {mounted && settingsOpen && settingsMenuStyle ? createPortal(settingsMenu, document.body) : null}
    </>
  )
}
