'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import LanguageSwitcher from './LanguageSwitcher'
import { AppIcon } from '@/components/ui/icons'

export default function Navbar() {
  const { data: session } = useSession()
  const t = useTranslations('nav')
  const tc = useTranslations('common')

  return (
    <nav className="glass-nav sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-2">
            <Link href={session ? "/workspace" : "/"} className="group">
              <Image
                src="/logo-small.png?v=1"
                alt={tc('appName')}
                width={80}
                height={80}
                className="object-contain transition-transform group-hover:scale-110"
              />
            </Link>
            <span className="glass-chip glass-chip-info px-2.5 py-1 text-[11px]">
              {tc('betaVersion')}
            </span>
          </div>
          <div className="flex items-center space-x-6">
            {session ? (
              <>
                <Link
                  href="/workspace"
                  className="text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] font-medium transition-colors"
                >
                  {t('workspace')}
                </Link>
                <Link
                  href="/workspace/asset-hub"
                  className="text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] font-medium transition-colors flex items-center gap-1"
                >
                  <AppIcon name="folderHeart" className="w-4 h-4" />
                  {t('assetHub')}
                </Link>
                <Link
                  href="/profile"
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
                  href="/auth/signin"
                  className="text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] font-medium transition-colors"
                >
                  {t('signin')}
                </Link>
                <Link
                  href="/auth/signup"
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
  )
}
