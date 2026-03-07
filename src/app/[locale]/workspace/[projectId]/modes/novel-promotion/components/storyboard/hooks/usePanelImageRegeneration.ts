'use client'
import { logInfo as _ulogInfo, logWarn as _ulogWarn } from '@/lib/logging/core'

import { useCallback } from 'react'
import type { NovelPromotionStoryboard } from '@/types/project'
import {
  StoryboardImageMutationResult,
  getStoryboardPanels,
  isAbortError,
} from './image-generation-runtime'

interface RegeneratePanelMutationLike {
  mutateAsync: (payload: { panelId: string; count: number }) => Promise<unknown>
}

interface UsePanelImageRegenerationParams {
  localStoryboards: NovelPromotionStoryboard[]
  setLocalStoryboards: React.Dispatch<React.SetStateAction<NovelPromotionStoryboard[]>>
  submittingPanelImageIds: Set<string>
  setSubmittingPanelImageIds: React.Dispatch<React.SetStateAction<Set<string>>>
  onSilentRefresh?: (() => void | Promise<void>) | null
  refreshEpisode: () => void
  refreshStoryboards: () => void
  regeneratePanelMutation: RegeneratePanelMutationLike
  selectPanelCandidateIndex: (panelId: string, index: number) => void
}

export function usePanelImageRegeneration({
  localStoryboards,
  submittingPanelImageIds,
  setSubmittingPanelImageIds,
  onSilentRefresh,
  refreshEpisode,
  refreshStoryboards,
  regeneratePanelMutation,
  selectPanelCandidateIndex,
}: UsePanelImageRegenerationParams) {
  const regeneratePanelImage = useCallback(
    async (panelId: string, count: number = 1, force: boolean = false) => {
      if (!force && submittingPanelImageIds.has(panelId)) return

      setSubmittingPanelImageIds((previous) => new Set(previous).add(panelId))

      let handoffToTaskState = false
      try {
        const data = await regeneratePanelMutation.mutateAsync({ panelId, count })
        const result = (data || {}) as StoryboardImageMutationResult

        if (result.async) {
          _ulogInfo(`[regeneratePanelImage] async submitted: ${panelId}`)
          handoffToTaskState = true
          if (onSilentRefresh) {
            await onSilentRefresh()
          }
          refreshEpisode()
          refreshStoryboards()
          return
        }

        if (onSilentRefresh) {
          await onSilentRefresh()
        }
        refreshEpisode()
        refreshStoryboards()
        selectPanelCandidateIndex(panelId, 0)
      } catch (error: unknown) {
        if (isAbortError(error)) return
        // Mutation errors (e.g. network failure, API 500) are transient.
        // The task was never created in the database, so we log and let user retry.
        _ulogWarn(`[regeneratePanelImage] mutation failed for panel ${panelId}:`, error)
      } finally {
        if (handoffToTaskState) return
        setSubmittingPanelImageIds((previous) => {
          const next = new Set(previous)
          next.delete(panelId)
          return next
        })
      }
    },
    [
      onSilentRefresh,
      refreshEpisode,
      refreshStoryboards,
      regeneratePanelMutation,
      selectPanelCandidateIndex,
      setSubmittingPanelImageIds,
      submittingPanelImageIds,
    ],
  )

  const regenerateAllPanelsIndividually = useCallback(async (storyboardId: string) => {
    const storyboard = localStoryboards.find((item) => item.id === storyboardId)
    if (!storyboard) return

    const panels = getStoryboardPanels(storyboard)
    if (panels.length === 0) return

    const panelsToGenerate = panels.filter(
      (panel) => !panel.imageUrl && !panel.imageTaskRunning && !submittingPanelImageIds.has(panel.id),
    )
    if (panelsToGenerate.length === 0) return

    await Promise.all(panelsToGenerate.map((panel) => regeneratePanelImage(panel.id)))
  }, [localStoryboards, regeneratePanelImage, submittingPanelImageIds])

  return {
    regeneratePanelImage,
    regenerateAllPanelsIndividually,
  }
}
