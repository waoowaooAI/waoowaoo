'use client'

import { useMemo } from 'react'
import type { NovelPromotionStoryboard } from '@/types/project'
import type { PanelEditData } from '../../PanelEditForm'
import type { StoryboardPanel } from './useStoryboardState'
import type { SelectedAsset } from './useImageGeneration'
import { useStoryboardAiDataRuntime } from './useStoryboardAiDataRuntime'

interface AssetPickerPanelRef {
  panelId: string
  type: 'character' | 'location'
}

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

interface UseStoryboardModalRuntimeParams {
  projectId: string
  videoRatio: string
  localStoryboards: NovelPromotionStoryboard[]
  editingPanel: { storyboardId: string; panelIndex: number } | null
  setEditingPanel: (panel: { storyboardId: string; panelIndex: number } | null) => void
  assetPickerPanel: AssetPickerPanelRef | null
  setAssetPickerPanel: (panel: AssetPickerPanelRef | null) => void
  aiDataPanel: AIDataPanelRef | null
  setAIDataPanel: (panel: AIDataPanelRef | null) => void
  previewImage: string | null
  setPreviewImage: (url: string | null) => void
  getTextPanels: (storyboard: NovelPromotionStoryboard) => StoryboardPanel[]
  getPanelEditData: (panel: StoryboardPanel) => PanelEditData
  updatePanelEdit: (panelId: string, panel: StoryboardPanel, updates: Partial<PanelEditData>) => void
  savePanelWithData: (storyboardId: string, panelIdOrData: string | PanelEditData) => void | Promise<void>
  getDefaultAssetsForClip: (clipId: string) => SelectedAsset[]
  handleEditSubmit: (prompt: string, images: string[], assets: SelectedAsset[]) => Promise<void>
  handleAddCharacter: (characterName: string, appearance: string) => void
  handleSetLocation: (locationName: string) => void
  updatePhotographyPlanMutation: PhotographyPlanMutation
  updatePanelActingNotesMutation: ActingNotesMutation
}

interface StoryboardPanelReference {
  storyboardId: string
  panel: StoryboardPanel
}

function findPanelById(
  localStoryboards: NovelPromotionStoryboard[],
  getTextPanels: (storyboard: NovelPromotionStoryboard) => StoryboardPanel[],
  panelId: string,
): StoryboardPanelReference | null {
  for (const storyboard of localStoryboards) {
    const panel = getTextPanels(storyboard).find((candidate) => candidate.id === panelId)
    if (panel) {
      return {
        storyboardId: storyboard.id,
        panel,
      }
    }
  }
  return null
}

export function useStoryboardModalRuntime({
  projectId,
  videoRatio,
  localStoryboards,
  editingPanel,
  setEditingPanel,
  assetPickerPanel,
  setAssetPickerPanel,
  aiDataPanel,
  setAIDataPanel,
  previewImage,
  setPreviewImage,
  getTextPanels,
  getPanelEditData,
  updatePanelEdit,
  savePanelWithData,
  getDefaultAssetsForClip,
  handleEditSubmit,
  handleAddCharacter,
  handleSetLocation,
  updatePhotographyPlanMutation,
  updatePanelActingNotesMutation,
}: UseStoryboardModalRuntimeParams) {
  const imageEditDefaults = useMemo(() => {
    if (!editingPanel) return []
    const clipId = localStoryboards.find((storyboard) => storyboard.id === editingPanel.storyboardId)?.clipId || ''
    return getDefaultAssetsForClip(clipId)
  }, [editingPanel, getDefaultAssetsForClip, localStoryboards])

  const { aiDataRuntime, handleSaveAIData } = useStoryboardAiDataRuntime({
    aiDataPanel,
    localStoryboards,
    getTextPanels,
    getPanelEditData,
    updatePanelEdit,
    savePanelWithData,
    updatePhotographyPlanMutation,
    updatePanelActingNotesMutation,
  })

  const pickerPanelRuntime = useMemo(() => {
    if (!assetPickerPanel) return null
    return findPanelById(localStoryboards, getTextPanels, assetPickerPanel.panelId)
  }, [assetPickerPanel, getTextPanels, localStoryboards])

  return {
    projectId,
    videoRatio,
    editingPanel,
    imageEditDefaults,
    handleEditSubmit,
    closeImageEditModal: () => setEditingPanel(null),

    aiDataPanel,
    aiDataRuntime,
    closeAIDataModal: () => setAIDataPanel(null),
    handleSaveAIData,

    previewImage,
    closePreviewImage: () => setPreviewImage(null),

    assetPickerPanel,
    pickerPanelRuntime,
    closeAssetPicker: () => setAssetPickerPanel(null),
    handleAddCharacter,
    handleSetLocation,
    hasCharacterPicker: assetPickerPanel?.type === 'character',
    hasLocationPicker: assetPickerPanel?.type === 'location',
  }
}
