import { useCallback, useState } from 'react'
import type { MatchedVoiceLine } from '../../../types'
import type { VideoPanelCardShellProps } from '../../types'
import { getErrorMessage } from '../shared'

interface UsePanelLipSyncParams {
  panel: VideoPanelCardShellProps['panel']
  matchedVoiceLines: MatchedVoiceLine[]
  onLipSync?: (storyboardId: string, panelIndex: number, voiceLineId: string, panelId?: string) => Promise<void>
}

export function usePanelLipSync({
  panel,
  matchedVoiceLines,
  onLipSync,
}: UsePanelLipSyncParams) {
  const [showLipSyncPanel, setShowLipSyncPanel] = useState(false)
  const [executingLipSync, setExecutingLipSync] = useState(false)
  const [lipSyncError, setLipSyncError] = useState<string | null>(null)

  const closeLipSyncPanel = useCallback(() => {
    setShowLipSyncPanel(false)
  }, [])

  const executeLipSync = useCallback(async (voiceLine: MatchedVoiceLine) => {
    if (!onLipSync) return
    setLipSyncError(null)
    setExecutingLipSync(true)
    try {
      await onLipSync(panel.storyboardId, panel.panelIndex, voiceLine.id, panel.panelId)
      setShowLipSyncPanel(false)
    } catch (error: unknown) {
      setLipSyncError(getErrorMessage(error))
    } finally {
      setExecutingLipSync(false)
    }
  }, [onLipSync, panel.panelId, panel.panelIndex, panel.storyboardId])

  const handleStartLipSync = useCallback(() => {
    if (!panel.videoUrl || matchedVoiceLines.length === 0) return
    if (matchedVoiceLines.length === 1) {
      void executeLipSync(matchedVoiceLines[0])
      return
    }
    setShowLipSyncPanel(true)
    setLipSyncError(null)
  }, [executeLipSync, matchedVoiceLines, panel.videoUrl])

  return {
    showLipSyncPanel,
    executingLipSync,
    lipSyncError,
    closeLipSyncPanel,
    handleStartLipSync,
    executeLipSync,
  }
}
