'use client'

import { useEffect } from 'react'

interface UseWorkspaceModalEscapeParams {
  isAssetLibraryOpen: boolean
  closeAssetLibrary: () => void
  isSettingsModalOpen: boolean
  setIsSettingsModalOpen: (open: boolean) => void
  isWorldContextModalOpen: boolean
  setIsWorldContextModalOpen: (open: boolean) => void
}

export function useWorkspaceModalEscape({
  isAssetLibraryOpen,
  closeAssetLibrary,
  isSettingsModalOpen,
  setIsSettingsModalOpen,
  isWorldContextModalOpen,
  setIsWorldContextModalOpen,
}: UseWorkspaceModalEscapeParams) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (isAssetLibraryOpen) closeAssetLibrary()
      if (isSettingsModalOpen) setIsSettingsModalOpen(false)
      if (isWorldContextModalOpen) setIsWorldContextModalOpen(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [
    closeAssetLibrary,
    isAssetLibraryOpen,
    isSettingsModalOpen,
    isWorldContextModalOpen,
    setIsSettingsModalOpen,
    setIsWorldContextModalOpen,
  ])
}
