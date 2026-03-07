'use client'

import { useState } from 'react'

export function useStoryboardStageUiState() {
  const [assetPickerPanel, setAssetPickerPanel] = useState<{
    panelId: string
    type: 'character' | 'location'
  } | null>(null)

  const [aiDataPanel, setAIDataPanel] = useState<{
    storyboardId: string
    panelIndex: number
  } | null>(null)

  const [isEpisodeBatchSubmitting, setIsEpisodeBatchSubmitting] = useState(false)

  return {
    assetPickerPanel,
    setAssetPickerPanel,
    aiDataPanel,
    setAIDataPanel,
    isEpisodeBatchSubmitting,
    setIsEpisodeBatchSubmitting,
  }
}
