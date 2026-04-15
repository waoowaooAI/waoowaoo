'use client'

import { useEffect, useRef } from 'react'

interface SearchParamsLike {
  get: (name: string) => string | null
  toString: () => string
}

interface RouterLike {
  replace: (href: string, options?: { scroll?: boolean }) => void
}

interface UseWorkspaceAutoRunParams {
  searchParams: SearchParamsLike | null
  router: RouterLike
  episodeId?: string
  novelText: string
  isTransitioning: boolean
  isStoryToScriptRunning: boolean
  runWithRebuildConfirm: (
    action: 'storyToScript' | 'scriptToStoryboard',
    operation: () => Promise<void>,
  ) => Promise<void>
  runStoryToScriptFlow: () => Promise<void>
}

export function useWorkspaceAutoRun({
  searchParams,
  router,
  episodeId,
  novelText,
  isTransitioning,
  isStoryToScriptRunning,
  runWithRebuildConfirm,
  runStoryToScriptFlow,
}: UseWorkspaceAutoRunParams) {
  const handledAutoRunKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!searchParams) return
    if (searchParams.get('autoRun') !== 'storyToScript') return
    if (!episodeId) return
    if (!novelText.trim()) return
    if (isTransitioning || isStoryToScriptRunning) return

    const autoRunKey = `storyToScript:${episodeId}`
    if (handledAutoRunKeyRef.current === autoRunKey) {
      return
    }
    handledAutoRunKeyRef.current = autoRunKey

    const params = new URLSearchParams(searchParams.toString())
    params.delete('autoRun')
    router.replace(`?${params.toString()}`, { scroll: false })

    void runWithRebuildConfirm('storyToScript', runStoryToScriptFlow)
  }, [
    episodeId,
    isStoryToScriptRunning,
    isTransitioning,
    novelText,
    router,
    runStoryToScriptFlow,
    runWithRebuildConfirm,
    searchParams,
  ])
}
