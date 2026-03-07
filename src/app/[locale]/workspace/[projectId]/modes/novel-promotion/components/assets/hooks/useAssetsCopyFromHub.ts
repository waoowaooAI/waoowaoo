'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { isAbortError } from '@/lib/error-utils'
import { useCopyProjectAssetFromGlobal } from '@/lib/query/hooks'

type ToastType = 'success' | 'warning' | 'error'

type ShowToast = (message: string, type?: ToastType, duration?: number) => void

export type GlobalCopyTarget = {
  type: 'character' | 'location' | 'voice'
  targetId: string
}

interface UseAssetsCopyFromHubParams {
  projectId: string
  onRefresh: () => void | Promise<void>
  showToast: ShowToast
}

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)

export function useAssetsCopyFromHub({ projectId, onRefresh, showToast }: UseAssetsCopyFromHubParams) {
  const t = useTranslations('assets')
  const copyFromGlobalAsset = useCopyProjectAssetFromGlobal(projectId)
  const [copyFromGlobalTarget, setCopyFromGlobalTarget] = useState<GlobalCopyTarget | null>(null)
  const [isGlobalCopyInFlight, setIsGlobalCopyInFlight] = useState(false)

  const handleCopyFromGlobal = useCallback((characterId: string) => {
    setCopyFromGlobalTarget({ type: 'character', targetId: characterId })
  }, [])

  const handleCopyLocationFromGlobal = useCallback((locationId: string) => {
    setCopyFromGlobalTarget({ type: 'location', targetId: locationId })
  }, [])

  const handleVoiceSelectFromHub = useCallback((characterId: string) => {
    setCopyFromGlobalTarget({ type: 'voice', targetId: characterId })
  }, [])

  const handleCloseCopyPicker = useCallback(() => {
    setCopyFromGlobalTarget(null)
  }, [])

  const handleConfirmCopyFromGlobal = useCallback(async (globalAssetId: string) => {
    if (!copyFromGlobalTarget) return

    setIsGlobalCopyInFlight(true)
    try {
      await copyFromGlobalAsset.mutateAsync({
        type: copyFromGlobalTarget.type,
        targetId: copyFromGlobalTarget.targetId,
        globalAssetId,
      })

      const successMsg = copyFromGlobalTarget.type === 'character'
        ? t('assetLibrary.copySuccessCharacter')
        : copyFromGlobalTarget.type === 'location'
          ? t('assetLibrary.copySuccessLocation')
          : t('assetLibrary.copySuccessVoice')
      showToast(successMsg, 'success')
      setCopyFromGlobalTarget(null)
      await Promise.resolve(onRefresh())
    } catch (error: unknown) {
      if (!isAbortError(error)) {
        showToast(t('assetLibrary.copyFailed', { error: getErrorMessage(error) }), 'error')
      }
    } finally {
      setIsGlobalCopyInFlight(false)
    }
  }, [copyFromGlobalAsset, copyFromGlobalTarget, onRefresh, showToast, t])

  return {
    copyFromGlobalTarget,
    isGlobalCopyInFlight,
    handleCopyFromGlobal,
    handleCopyLocationFromGlobal,
    handleVoiceSelectFromHub,
    handleConfirmCopyFromGlobal,
    handleCloseCopyPicker,
  }
}
