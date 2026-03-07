'use client'

import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { NovelPromotionStoryboard } from '@/types/project'
import { queryKeys } from '@/lib/query/keys'

type EpisodeDataCache = Record<string, unknown> & {
  storyboards?: NovelPromotionStoryboard[]
}

function isEpisodeDataCache(value: unknown): value is EpisodeDataCache {
  return typeof value === 'object' && value !== null
}

interface UsePanelEpisodeCachePatchParams {
  projectId: string
  episodeId?: string
}

export function usePanelEpisodeCachePatch({
  projectId,
  episodeId,
}: UsePanelEpisodeCachePatchParams) {
  const queryClient = useQueryClient()

  return useCallback((panelId: string, updates: Record<string, unknown>) => {
    if (!episodeId) return
    queryClient.setQueryData(queryKeys.episodeData(projectId, episodeId), (previous: unknown) => {
      if (!isEpisodeDataCache(previous) || !Array.isArray(previous.storyboards)) return previous

      let changed = false
      const storyboards = previous.storyboards.map((storyboard) => {
        const panels = Array.isArray(storyboard?.panels) ? storyboard.panels : []
        let panelChanged = false
        const nextPanels = panels.map((panel) => {
          if (panel?.id !== panelId) return panel
          panelChanged = true
          changed = true
          return {
            ...panel,
            ...updates,
          }
        })

        if (!panelChanged) return storyboard
        return {
          ...storyboard,
          panels: nextPanels,
        }
      })

      if (!changed) return previous
      return {
        ...previous,
        storyboards,
      }
    })
  }, [episodeId, projectId, queryClient])
}
