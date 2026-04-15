'use client'

import { useCallback } from 'react'
import type { BindablePanelOption, VoiceLine } from './types'

interface UseVoiceLineBindingsParams {
  bindablePanelOptions: BindablePanelOption[]
  onVoiceLineClick?: (storyboardId: string, panelIndex: number) => void
  handleStartEdit: (line: VoiceLine, boundPanelId: string) => void
}

export function useVoiceLineBindings({
  bindablePanelOptions,
  onVoiceLineClick,
  handleStartEdit,
}: UseVoiceLineBindingsParams) {
  const getBoundPanelIdForLine = useCallback((line: VoiceLine): string => {
    if (line.matchedPanelId) return line.matchedPanelId
    if (!line.matchedStoryboardId || line.matchedPanelIndex === null || line.matchedPanelIndex === undefined) return ''

    const matched = bindablePanelOptions.find(
      (option) => option.storyboardId === line.matchedStoryboardId && option.panelIndex === line.matchedPanelIndex,
    )
    return matched?.id || ''
  }, [bindablePanelOptions])

  const handleStartEditLine = useCallback((line: VoiceLine) => {
    handleStartEdit(line, getBoundPanelIdForLine(line))
  }, [getBoundPanelIdForLine, handleStartEdit])

  const handleLocatePanel = useCallback((voiceLine: VoiceLine) => {
    if (!onVoiceLineClick) return

    let targetStoryboardId = voiceLine.matchedStoryboardId || null
    let targetPanelIndex = voiceLine.matchedPanelIndex
    if (voiceLine.matchedPanelId) {
      const matchedPanel = bindablePanelOptions.find((option) => option.id === voiceLine.matchedPanelId)
      if (matchedPanel) {
        targetStoryboardId = matchedPanel.storyboardId
        targetPanelIndex = matchedPanel.panelIndex
      }
    }

    if (!targetStoryboardId || targetPanelIndex === null || targetPanelIndex === undefined) return
    onVoiceLineClick(targetStoryboardId, targetPanelIndex)
  }, [bindablePanelOptions, onVoiceLineClick])

  const handleDownloadSingle = (audioUrl: string) => {
    window.open(audioUrl, '_blank')
  }

  return {
    getBoundPanelIdForLine,
    handleStartEditLine,
    handleLocatePanel,
    handleDownloadSingle,
  }
}
