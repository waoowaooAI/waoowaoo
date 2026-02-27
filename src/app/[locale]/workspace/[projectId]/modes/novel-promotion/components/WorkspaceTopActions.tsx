'use client'

import { AppIcon } from '@/components/ui/icons'

interface WorkspaceTopActionsProps {
  onOpenAssetLibrary: () => void
  onOpenSettings: () => void
  onRefresh: () => void
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
  return (
    <div className="fixed top-20 right-6 z-50 flex gap-3">
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
        onClick={onRefresh}
        className="glass-btn-base glass-btn-secondary flex items-center gap-2 px-4 py-3 rounded-3xl text-[var(--glass-text-primary)]"
        title={refreshTitle}
      >
        <AppIcon name="refresh" className="w-5 h-5" />
      </button>
    </div>
  )
}
