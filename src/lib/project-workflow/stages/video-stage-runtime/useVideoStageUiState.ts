'use client'

import { useCallback, useState } from 'react'

export function useVideoStageUiState() {
  const [panelVideoPreference, setPanelVideoPreference] = useState<Map<string, boolean>>(new Map())
  const [voiceLinesExpanded, setVoiceLinesExpanded] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  const toggleVoiceLinesExpanded = useCallback(() => {
    setVoiceLinesExpanded((previous) => !previous)
  }, [])

  const toggleLipSyncVideo = useCallback((panelKey: string, value: boolean) => {
    setPanelVideoPreference((previous) => new Map(previous).set(panelKey, value))
  }, [])

  const closePreviewImage = useCallback(() => {
    setPreviewImage(null)
  }, [])

  return {
    panelVideoPreference,
    voiceLinesExpanded,
    previewImage,
    setPreviewImage,
    toggleVoiceLinesExpanded,
    toggleLipSyncVideo,
    closePreviewImage,
  }
}
