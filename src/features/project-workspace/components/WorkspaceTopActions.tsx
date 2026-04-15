'use client'

import { useCallback, useState } from 'react'
import { AppIcon } from '@/components/ui/icons'
import { useToast } from '@/contexts/ToastContext'

interface WorkspaceTopActionsProps {
  onOpenAssetLibrary: () => void
  onOpenSettings: () => void
  onRefresh: () => Promise<void> | void
  assetLibraryLabel: string
  settingsLabel: string
  refreshTitle: string
}

export default function WorkspaceTopActions({
  onOpenAssetLibrary,
  onOpenSettings,
  onRefresh,
  assetLibraryLabel,
  settingsLabel,
  refreshTitle,
}: WorkspaceTopActionsProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const { showToast } = useToast()

  const handleRefreshClick = useCallback(async () => {
    if (isRefreshing) {
      return
    }

    try {
      setIsRefreshing(true)
      await Promise.resolve(onRefresh())
      showToast(refreshTitle, 'success', 2400)
    } catch (error) {
      // 显式记录错误，保持“显式失败”原则，但不打断用户操作
      // eslint-disable-next-line no-console
      console.error('[WorkspaceTopActions] 刷新失败', error)
    } finally {
      setIsRefreshing(false)
    }
  }, [isRefreshing, onRefresh, refreshTitle, showToast])

  return (
    <div className="fixed top-24 right-6 z-40 flex gap-3">
      <button
        onClick={onOpenAssetLibrary}
        className="glass-btn-base glass-btn-secondary flex items-center gap-2 px-4 py-3 rounded-3xl text-[var(--glass-text-primary)]"
      >
        <AppIcon name="package" className="h-5 w-5" />
        <span className="font-semibold text-sm hidden md:inline tracking-[0.01em]">{assetLibraryLabel}</span>
      </button>
      <button
        onClick={onOpenSettings}
        className="glass-btn-base glass-btn-secondary flex items-center gap-2 px-4 py-3 rounded-3xl text-[var(--glass-text-primary)]"
      >
        <AppIcon name="settingsHexMinor" className="h-5 w-5" />
        <span className="font-semibold text-sm hidden md:inline tracking-[0.01em]">{settingsLabel}</span>
      </button>
      <button
        onClick={handleRefreshClick}
        className={`glass-btn-base glass-btn-secondary flex items-center gap-2 px-4 py-3 rounded-3xl text-[var(--glass-text-primary)] ${
          isRefreshing ? 'opacity-60 cursor-wait' : ''
        }`}
        title={refreshTitle}
        disabled={isRefreshing}
      >
        <AppIcon name="refresh" className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
      </button>
    </div>
  )
}
