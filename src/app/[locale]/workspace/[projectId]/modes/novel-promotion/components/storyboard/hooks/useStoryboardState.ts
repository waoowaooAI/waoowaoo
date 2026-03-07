'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query/keys'
import { NovelPromotionStoryboard, NovelPromotionClip, NovelPromotionPanel } from '@/types/project'
import { PanelEditData } from '../../PanelEditForm'
import {
  computeStoryboardStartIndex,
  computeTotalPanels,
  formatClipTitle,
  getStoryboardPanels,
  sortStoryboardsByClipOrder,
} from './storyboard-state-utils'

export interface StoryboardPanel {
  id: string
  panelIndex: number
  panel_number: number
  shot_type: string
  camera_move: string | null
  description: string
  characters: { name: string; appearance: string }[]
  location?: string
  srt_range?: string
  duration?: number
  video_prompt?: string
  source_text?: string
  candidateImages?: string
  imageUrl?: string | null
  photographyRules?: string | null  // 单镜头摄影规则JSON
  actingNotes?: string | null       // 演技指导数据JSON
  imageTaskRunning?: boolean  // 任务态运行状态（由 tasks 派生）
}

interface UseStoryboardStateProps {
  projectId: string
  episodeId: string
  initialStoryboards: NovelPromotionStoryboard[]
  clips: NovelPromotionClip[]
}

export function useStoryboardState({
  projectId,
  episodeId,
  initialStoryboards,
  clips,
}: UseStoryboardStateProps) {
  const queryClient = useQueryClient()
  const localStoryboards = useMemo(
    () => sortStoryboardsByClipOrder(initialStoryboards, clips),
    [clips, initialStoryboards],
  )

  const setLocalStoryboards = useCallback<React.Dispatch<React.SetStateAction<NovelPromotionStoryboard[]>>>(
    (nextStoryboardsOrUpdater) => {
      const resolveNextStoryboards = (previousStoryboards: NovelPromotionStoryboard[]) => (
        typeof nextStoryboardsOrUpdater === 'function'
          ? (nextStoryboardsOrUpdater as (previous: NovelPromotionStoryboard[]) => NovelPromotionStoryboard[])(previousStoryboards)
          : nextStoryboardsOrUpdater
      )

      queryClient.setQueryData(queryKeys.episodeData(projectId, episodeId), (previous: unknown) => {
        if (!previous || typeof previous !== 'object') return previous
        const episode = previous as { storyboards?: NovelPromotionStoryboard[] }
        const previousStoryboards = Array.isArray(episode.storyboards) ? episode.storyboards : []
        const nextStoryboards = resolveNextStoryboards(previousStoryboards)
        if (nextStoryboards === previousStoryboards) return previous
        return {
          ...episode,
          storyboards: nextStoryboards,
        }
      })

      queryClient.setQueryData(queryKeys.storyboards.all(episodeId), (previous: unknown) => {
        if (!previous || typeof previous !== 'object') return previous
        const payload = previous as { storyboards?: NovelPromotionStoryboard[] }
        const previousStoryboards = Array.isArray(payload.storyboards) ? payload.storyboards : []
        const nextStoryboards = resolveNextStoryboards(previousStoryboards)
        if (nextStoryboards === previousStoryboards) return previous
        return {
          ...payload,
          storyboards: nextStoryboards,
        }
      })
    },
    [episodeId, projectId, queryClient],
  )

  const [expandedClips, setExpandedClips] = useState<Set<string>>(new Set())

  const [panelEdits, setPanelEdits] = useState<Record<string, PanelEditData>>({})
  // Keep latest panel edits for async callbacks without adding unstable deps.
  const panelEditsRef = useRef<Record<string, PanelEditData>>({})
  panelEditsRef.current = panelEdits

  const getClipInfo = (clipId: string) => clips.find(c => c.id === clipId)

  const getPanelImages = (storyboard: NovelPromotionStoryboard): Array<string | null> => {
    const panels = getStoryboardPanels(storyboard)
    if (panels.length > 0) {
      return panels.map((p) => p.imageUrl || null)
    }
    return []
  }

  const getTextPanels = (storyboard: NovelPromotionStoryboard): StoryboardPanel[] => {
    const panels = getStoryboardPanels(storyboard)
    const sortedPanels = [...panels].sort((a: NovelPromotionPanel, b: NovelPromotionPanel) =>
      (a.panelIndex || 0) - (b.panelIndex || 0)
    )
    return sortedPanels.map((p) => {
      const parsedChars = p.characters ? JSON.parse(p.characters) : []
      const characters = Array.isArray(parsedChars)
        ? parsedChars.filter((item): item is { name: string; appearance: string } => (
          typeof item === 'object'
          && item !== null
          && typeof (item as { name?: unknown }).name === 'string'
          && typeof (item as { appearance?: unknown }).appearance === 'string'
        ))
        : []
      return {
        id: p.id,
        panelIndex: p.panelIndex,
        panel_number: p.panelNumber ?? p.panelIndex + 1,
        shot_type: p.shotType ?? '',
        camera_move: p.cameraMove,
        description: p.description ?? '',
        location: p.location || undefined,
        characters,
        srt_range: p.srtStart && p.srtEnd ? `${p.srtStart}-${p.srtEnd}` : undefined,
        duration: p.duration ?? undefined,
        video_prompt: p.videoPrompt || undefined,
        source_text: p.srtSegment || undefined,
        candidateImages: p.candidateImages || undefined,
        imageUrl: p.imageUrl,
        photographyRules: p.photographyRules,
        actingNotes: p.actingNotes,
        imageTaskRunning: p.imageTaskRunning || false
      }
    })
  }

  const getPanelEditData = (panel: StoryboardPanel): PanelEditData => {
    if (panelEdits[panel.id]) {
      return panelEdits[panel.id]
    }
    return {
      id: panel.id,
      panelIndex: panel.panelIndex,
      panelNumber: panel.panel_number,
      shotType: panel.shot_type,
      cameraMove: panel.camera_move,
      description: panel.description,
      location: panel.location || null,
      characters: panel.characters || [],
      srtStart: null,
      srtEnd: null,
      duration: panel.duration || null,
      videoPrompt: panel.video_prompt || null,
      photographyRules: panel.photographyRules ?? null,
      actingNotes: panel.actingNotes ?? null,
      sourceText: panel.source_text
    }
  }

  const updatePanelEdit = (panelId: string, panel: StoryboardPanel, updates: Partial<PanelEditData>) => {
    setPanelEdits(prev => {
      const currentData = prev[panelId] || getPanelEditData(panel)
      return {
        ...prev,
        [panelId]: { ...currentData, ...updates }
      }
    })
  }

  const toggleExpandedClip = (storyboardId: string) => {
    setExpandedClips(prev => {
      const next = new Set(prev)
      if (next.has(storyboardId)) {
        next.delete(storyboardId)
      } else {
        next.add(storyboardId)
      }
      return next
    })
  }

  const sortedStoryboards = [...localStoryboards].sort((a, b) => {
    const clipIndexA = clips.findIndex(c => c.id === a.clipId)
    const clipIndexB = clips.findIndex(c => c.id === b.clipId)
    return clipIndexA - clipIndexB
  })

  const totalPanels = computeTotalPanels(localStoryboards)
  const storyboardStartIndex = computeStoryboardStartIndex(sortedStoryboards)

  return {
    localStoryboards,
    setLocalStoryboards,
    sortedStoryboards,
    expandedClips,
    toggleExpandedClip,
    panelEdits,
    setPanelEdits,
    panelEditsRef,
    getClipInfo,
    getPanelImages,
    getTextPanels,
    getPanelEditData,
    updatePanelEdit,
    formatClipTitle,
    totalPanels,
    storyboardStartIndex
  }
}
