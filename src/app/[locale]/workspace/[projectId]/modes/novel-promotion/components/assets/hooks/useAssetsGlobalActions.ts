'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { useAnalyzeProjectGlobalAssets } from '@/lib/query/hooks'

type ToastType = 'success' | 'warning' | 'error'

type ShowToast = (message: string, type?: ToastType, duration?: number) => void
type TranslateValues = Record<string, string | number | Date>
type Translate = (key: string, values?: TranslateValues) => string

interface UseAssetsGlobalActionsParams {
  projectId: string
  triggerGlobalAnalyze?: boolean
  onGlobalAnalyzeComplete?: () => void
  onRefresh: () => void | Promise<void>
  showToast: ShowToast
  t: Translate
}

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)

export function useAssetsGlobalActions({
  projectId,
  triggerGlobalAnalyze = false,
  onGlobalAnalyzeComplete,
  onRefresh,
  showToast,
  t,
}: UseAssetsGlobalActionsParams) {
  const analyzeGlobalAssets = useAnalyzeProjectGlobalAssets(projectId)
  const [isGlobalAnalyzing, setIsGlobalAnalyzing] = useState(false)
  const hasTriggeredGlobalAnalyze = useRef(false)

  const globalAnalyzingState = useMemo(() => {
    if (!isGlobalAnalyzing) return null
    return resolveTaskPresentationState({
      phase: 'processing',
      intent: 'generate',
      resource: 'text',
      hasOutput: false,
    })
  }, [isGlobalAnalyzing])

  const handleGlobalAnalyze = useCallback(async () => {
    if (isGlobalAnalyzing) return

    try {
      setIsGlobalAnalyzing(true)
      showToast(t('toolbar.globalAnalyzing'), 'warning', 60000)

      const data = await analyzeGlobalAssets.mutateAsync()
      await Promise.resolve(onRefresh())

      showToast(
        t('toolbar.globalAnalyzeSuccess', {
          characters: data.stats?.newCharacters || 0,
          locations: data.stats?.newLocations || 0,
        }),
        'success',
        5000,
      )
    } catch (error: unknown) {
      _ulogError('Global analyze error:', error)
      showToast(`${t('toolbar.globalAnalyzeFailed')}: ${getErrorMessage(error)}`, 'error', 5000)
    } finally {
      setIsGlobalAnalyzing(false)
    }
  }, [analyzeGlobalAssets, isGlobalAnalyzing, onRefresh, showToast, t])

  useEffect(() => {
    if (!triggerGlobalAnalyze || hasTriggeredGlobalAnalyze.current || isGlobalAnalyzing) {
      return
    }

    hasTriggeredGlobalAnalyze.current = true
    _ulogInfo('[AssetsStage] 通过 props 触发全局分析')

    const timer = window.setTimeout(() => {
      void (async () => {
        await handleGlobalAnalyze()
        onGlobalAnalyzeComplete?.()
      })()
    }, 500)

    return () => window.clearTimeout(timer)
  }, [handleGlobalAnalyze, isGlobalAnalyzing, onGlobalAnalyzeComplete, triggerGlobalAnalyze])

  return {
    isGlobalAnalyzing,
    globalAnalyzingState,
    handleGlobalAnalyze,
  }
}
