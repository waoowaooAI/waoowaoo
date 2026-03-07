'use client'

import { logWarn as _ulogWarn, logError as _ulogError } from '@/lib/logging/core'
import { useCallback, useMemo } from 'react'
import type { NovelPromotionStoryboard } from '@/types/project'
import type { PanelEditData } from '../../PanelEditForm'
import type { StoryboardPanel } from './useStoryboardState'
import { serializeStructuredJsonField } from '@/lib/novel-promotion/panel-ai-data-sync'

interface AIDataPanelRef {
  storyboardId: string
  panelIndex: number
}

interface PhotographyPlanMutation {
  mutateAsync: (payload: { storyboardId: string; photographyPlan: string }) => Promise<unknown>
}

interface ActingNotesMutation {
  mutateAsync: (payload: { storyboardId: string; panelIndex: number; actingNotes: string }) => Promise<unknown>
}

interface UseStoryboardAiDataRuntimeParams {
  aiDataPanel: AIDataPanelRef | null
  localStoryboards: NovelPromotionStoryboard[]
  getTextPanels: (storyboard: NovelPromotionStoryboard) => StoryboardPanel[]
  getPanelEditData: (panel: StoryboardPanel) => PanelEditData
  updatePanelEdit: (panelId: string, panel: StoryboardPanel, updates: Partial<PanelEditData>) => void
  savePanelWithData: (storyboardId: string, panelIdOrData: string | PanelEditData) => void | Promise<void>
  updatePhotographyPlanMutation: PhotographyPlanMutation
  updatePanelActingNotesMutation: ActingNotesMutation
}

function parseJsonSafely(value: unknown, logLabel: string) {
  if (!value) return null
  try {
    return typeof value === 'string' ? JSON.parse(value) : value
  } catch (error) {
    _ulogWarn(`Failed to parse ${logLabel}:`, error)
    return null
  }
}

export function useStoryboardAiDataRuntime({
  aiDataPanel,
  localStoryboards,
  getTextPanels,
  getPanelEditData,
  updatePanelEdit,
  savePanelWithData,
  updatePhotographyPlanMutation,
  updatePanelActingNotesMutation,
}: UseStoryboardAiDataRuntimeParams) {
  const aiDataRuntime = useMemo(() => {
    if (!aiDataPanel) return null

    const storyboard = localStoryboards.find((item) => item.id === aiDataPanel.storyboardId)
    if (!storyboard) return null

    const textPanels = getTextPanels(storyboard)
    const panel = textPanels[aiDataPanel.panelIndex]
    if (!panel) return null

    const panelData = getPanelEditData(panel)
    const photographyRules = parseJsonSafely(panel.photographyRules, 'photographyRules')
    const actingNotes = parseJsonSafely(panel.actingNotes, 'actingNotes')
    const characterNames = panelData.characters.map((character) => character.name)

    return {
      panelData,
      panel,
      storyboardId: storyboard.id,
      characterNames,
      photographyRules,
      actingNotes,
    }
  }, [aiDataPanel, getPanelEditData, getTextPanels, localStoryboards])

  const handleSaveAIData = useCallback(async (data: {
    shotType: string | null
    cameraMove: string | null
    description: string | null
    videoPrompt: string | null
    photographyRules: unknown
    actingNotes: unknown
  }) => {
    if (!aiDataRuntime) return

    const { panelData, panel, storyboardId } = aiDataRuntime
    const serializedPhotographyRules = serializeStructuredJsonField(data.photographyRules, 'photographyRules')
    const serializedActingNotes = serializeStructuredJsonField(data.actingNotes, 'actingNotes')
    const updatedPanelData: PanelEditData = {
      ...panelData,
      shotType: data.shotType,
      cameraMove: data.cameraMove,
      description: data.description,
      videoPrompt: data.videoPrompt,
      photographyRules: serializedPhotographyRules,
      actingNotes: serializedActingNotes,
    }

    updatePanelEdit(panel.id, panel, {
      shotType: data.shotType,
      cameraMove: data.cameraMove,
      description: data.description,
      videoPrompt: data.videoPrompt,
      photographyRules: serializedPhotographyRules,
      actingNotes: serializedActingNotes,
    })

    await savePanelWithData(storyboardId, updatedPanelData)

    if (data.photographyRules) {
      try {
        const photographyPlan =
          typeof data.photographyRules === 'string'
            ? data.photographyRules
            : JSON.stringify(data.photographyRules)
        await updatePhotographyPlanMutation.mutateAsync({
          storyboardId,
          photographyPlan,
        })
      } catch (error) {
        _ulogError('保存摄影规则失败:', error)
      }
    }

    if (data.actingNotes !== undefined) {
      try {
        const actingNotesPayload =
          typeof data.actingNotes === 'string'
            ? data.actingNotes
            : JSON.stringify(data.actingNotes ?? null)
        await updatePanelActingNotesMutation.mutateAsync({
          storyboardId,
          panelIndex: panel.panelIndex,
          actingNotes: actingNotesPayload,
        })
      } catch (error) {
        _ulogError('保存演技指导失败:', error)
      }
    }
  }, [
    aiDataRuntime,
    savePanelWithData,
    updatePanelActingNotesMutation,
    updatePanelEdit,
    updatePhotographyPlanMutation,
  ])

  return {
    aiDataRuntime,
    handleSaveAIData,
  }
}
