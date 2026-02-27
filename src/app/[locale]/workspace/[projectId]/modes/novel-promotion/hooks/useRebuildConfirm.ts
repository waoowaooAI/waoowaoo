'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { logWarn as _ulogWarn } from '@/lib/logging/core'

type RebuildActionType = 'storyToScript' | 'scriptToStoryboard'

interface RebuildConfirmContext {
  actionType: RebuildActionType
  storyboardCount: number
  panelCount: number
}

interface DownstreamCheckResult {
  shouldConfirm: boolean
  storyboardCount: number
  panelCount: number
}

type StoryboardStats = {
  storyboardCount: number
  panelCount: number
}

export function hasDownstreamStoryboardData(stats: StoryboardStats): boolean {
  return stats.storyboardCount > 0 || stats.panelCount > 0
}

interface StoryboardLike {
  panels?: unknown[] | null
}

interface UseRebuildConfirmParams {
  episodeId?: string
  episodeStoryboards?: StoryboardLike[]
  getProjectStoryboardStats: (episodeId: string) => Promise<StoryboardStats>
  t: (key: string, values?: Record<string, string | number | Date>) => string
}

export function useRebuildConfirm({
  episodeId,
  episodeStoryboards,
  getProjectStoryboardStats,
  t,
}: UseRebuildConfirmParams) {
  const [showRebuildConfirm, setShowRebuildConfirm] = useState(false)
  const [rebuildConfirmContext, setRebuildConfirmContext] = useState<RebuildConfirmContext | null>(null)
  const pendingRebuildActionRef = useRef<(() => Promise<void>) | null>(null)

  const getFallbackStoryboardStats = useCallback(() => {
    const storyboards = Array.isArray(episodeStoryboards) ? episodeStoryboards : []
    const storyboardCount = storyboards.length
    const panelCount = storyboards.reduce((sum: number, storyboard) => {
      const panels = Array.isArray(storyboard?.panels) ? storyboard.panels.length : 0
      return sum + panels
    }, 0)
    return { storyboardCount, panelCount }
  }, [episodeStoryboards])

  const checkStoryboardDownstreamData = useCallback(async (): Promise<DownstreamCheckResult> => {
    if (!episodeId) {
      return { shouldConfirm: false, storyboardCount: 0, panelCount: 0 }
    }

    try {
      const { storyboardCount, panelCount } = await getProjectStoryboardStats(episodeId)
      return {
        shouldConfirm: hasDownstreamStoryboardData({ storyboardCount, panelCount }),
        storyboardCount,
        panelCount,
      }
    } catch (error) {
      _ulogWarn('[RebuildConfirm] Failed to check downstream storyboards, fallback to local cache', error)
      const fallbackStats = getFallbackStoryboardStats()
      return {
        shouldConfirm: hasDownstreamStoryboardData(fallbackStats),
        storyboardCount: fallbackStats.storyboardCount,
        panelCount: fallbackStats.panelCount,
      }
    }
  }, [episodeId, getFallbackStoryboardStats, getProjectStoryboardStats])

  const runWithRebuildConfirm = useCallback(async (
    actionType: RebuildActionType,
    action: () => Promise<void>
  ) => {
    const downstream = await checkStoryboardDownstreamData()
    if (!downstream.shouldConfirm) {
      await action()
      return
    }

    pendingRebuildActionRef.current = action
    setRebuildConfirmContext({
      actionType,
      storyboardCount: downstream.storyboardCount,
      panelCount: downstream.panelCount,
    })
    setShowRebuildConfirm(true)
  }, [checkStoryboardDownstreamData])

  const handleCancelRebuildConfirm = useCallback(() => {
    pendingRebuildActionRef.current = null
    setShowRebuildConfirm(false)
    setRebuildConfirmContext(null)
  }, [])

  const handleAcceptRebuildConfirm = useCallback(() => {
    const pendingAction = pendingRebuildActionRef.current
    pendingRebuildActionRef.current = null
    setShowRebuildConfirm(false)
    setRebuildConfirmContext(null)
    if (pendingAction) {
      void pendingAction()
    }
  }, [])

  const rebuildConfirmTitle = useMemo(() => {
    if (!rebuildConfirmContext) return ''
    if (rebuildConfirmContext.actionType === 'storyToScript') {
      return t('rebuildConfirm.storyToScript.title')
    }
    return t('rebuildConfirm.scriptToStoryboard.title')
  }, [rebuildConfirmContext, t])

  const rebuildConfirmMessage = useMemo(() => {
    if (!rebuildConfirmContext) return ''
    const values = {
      storyboardCount: rebuildConfirmContext.storyboardCount,
      panelCount: rebuildConfirmContext.panelCount,
    }
    if (rebuildConfirmContext.actionType === 'storyToScript') {
      return t('rebuildConfirm.storyToScript.message', values)
    }
    return t('rebuildConfirm.scriptToStoryboard.message', values)
  }, [rebuildConfirmContext, t])

  return {
    showRebuildConfirm,
    rebuildConfirmTitle,
    rebuildConfirmMessage,
    runWithRebuildConfirm,
    handleCancelRebuildConfirm,
    handleAcceptRebuildConfirm,
  }
}
