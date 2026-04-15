'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

type RefreshOptions = { scope?: string; mode?: string }

interface RouterLike {
  replace: (href: string, options?: { scroll?: boolean }) => void
}

interface SearchParamsLike {
  get: (name: string) => string | null
  toString: () => string
}

interface UseWorkspaceAssetLibraryShellParams {
  currentStage: string
  searchParams: SearchParamsLike | null
  router: RouterLike
  onRefresh: (options?: RefreshOptions) => Promise<void>
}

export function useWorkspaceAssetLibraryShell({
  currentStage,
  searchParams,
  router,
  onRefresh,
}: UseWorkspaceAssetLibraryShellParams) {
  const [isAssetLibraryOpen, setIsAssetLibraryOpen] = useState(false)
  const [assetLibraryFocusCharacterId, setAssetLibraryFocusCharacterId] = useState<string | null>(null)
  const [assetLibraryFocusRequestId, setAssetLibraryFocusRequestId] = useState(0)
  const [triggerGlobalAnalyzeOnOpen, setTriggerGlobalAnalyzeOnOpen] = useState(false)
  const hasTriggeredGlobalAnalyze = useRef(false)

  const openAssetLibrary = useCallback((focusCharacterId?: string | null, refreshAssets = true) => {
    setAssetLibraryFocusCharacterId(focusCharacterId || null)
    setAssetLibraryFocusRequestId(prev => prev + 1)
    setIsAssetLibraryOpen(true)

    if (refreshAssets) {
      window.setTimeout(() => {
        onRefresh({ scope: 'assets' })
      }, 0)
    }
  }, [onRefresh])

  const closeAssetLibrary = useCallback(() => {
    setIsAssetLibraryOpen(false)
    setAssetLibraryFocusCharacterId(null)
  }, [])

  useEffect(() => {
    if (!searchParams) return

    const shouldTriggerGlobalAnalyze = searchParams.get('globalAnalyze') === '1'
    const shouldOpenAssetLibrary = searchParams.get('assetLibrary') === '1'
    const focusCharacterId = searchParams.get('focusCharacter')

    if (!shouldTriggerGlobalAnalyze && !shouldOpenAssetLibrary) {
      return
    }

    const newParams = new URLSearchParams(searchParams.toString())
    if (shouldTriggerGlobalAnalyze) newParams.delete('globalAnalyze')
    if (shouldOpenAssetLibrary) newParams.delete('assetLibrary')
    router.replace(`?${newParams.toString()}`, { scroll: false })

    openAssetLibrary(focusCharacterId)

    if (shouldTriggerGlobalAnalyze && !hasTriggeredGlobalAnalyze.current) {
      hasTriggeredGlobalAnalyze.current = true
      setTriggerGlobalAnalyzeOnOpen(true)
    }
  }, [openAssetLibrary, router, searchParams])

  useEffect(() => {
    const needsAssets =
      currentStage === 'script' ||
      currentStage === 'assets' ||
      currentStage === 'storyboard' ||
      currentStage === 'videos'

    if (needsAssets) {
      onRefresh({ scope: 'assets' })
    }
  }, [currentStage, onRefresh])

  return {
    isAssetLibraryOpen,
    assetLibraryFocusCharacterId,
    assetLibraryFocusRequestId,
    triggerGlobalAnalyzeOnOpen,
    setTriggerGlobalAnalyzeOnOpen,
    openAssetLibrary,
    closeAssetLibrary,
  }
}
