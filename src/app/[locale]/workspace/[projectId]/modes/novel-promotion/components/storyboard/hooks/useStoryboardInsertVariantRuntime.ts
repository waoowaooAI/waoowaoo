'use client'

import { useCallback, useState } from 'react'
import type { StoryboardPanel } from './useStoryboardState'
import type { VariantData, VariantOptions } from './usePanelVariant'

interface PanelRuntimeSnapshot {
  id: string
  panelNumber: number | null
  description: string | null
  imageUrl: string | null
}

interface VariantPanelRuntimeSnapshot extends PanelRuntimeSnapshot {
  storyboardId: string
}

interface UseStoryboardInsertVariantRuntimeParams {
  storyboardId: string
  textPanels: StoryboardPanel[]
  onInsertPanel: (storyboardId: string, insertAfterPanelId: string, userInput: string) => Promise<void>
  onPanelVariant: (
    sourcePanelId: string,
    storyboardId: string,
    insertAfterPanelId: string,
    variant: VariantData,
    options: VariantOptions,
  ) => Promise<void>
}

export function useStoryboardInsertVariantRuntime({
  storyboardId,
  textPanels,
  onInsertPanel,
  onPanelVariant,
}: UseStoryboardInsertVariantRuntimeParams) {
  const [insertModalOpen, setInsertModalOpen] = useState(false)
  const [insertAfterPanel, setInsertAfterPanel] = useState<PanelRuntimeSnapshot | null>(null)
  const [nextPanelForInsert, setNextPanelForInsert] = useState<PanelRuntimeSnapshot | null>(null)
  const [variantModalPanel, setVariantModalPanel] = useState<VariantPanelRuntimeSnapshot | null>(null)

  const handleOpenInsertModal = useCallback((panelIndex: number) => {
    const previousPanel = textPanels[panelIndex]
    const nextPanel = textPanels[panelIndex + 1] || null
    if (!previousPanel) return

    setInsertAfterPanel({
      id: previousPanel.id,
      panelNumber: previousPanel.panel_number,
      description: previousPanel.description,
      imageUrl: previousPanel.imageUrl ?? null,
    })

    setNextPanelForInsert(
      nextPanel
        ? {
          id: nextPanel.id,
          panelNumber: nextPanel.panel_number,
          description: nextPanel.description,
          imageUrl: nextPanel.imageUrl ?? null,
        }
        : null,
    )

    setInsertModalOpen(true)
  }, [textPanels])

  const handleCloseInsertModal = useCallback(() => {
    setInsertModalOpen(false)
    setInsertAfterPanel(null)
    setNextPanelForInsert(null)
  }, [])

  const handleInsert = useCallback(async (userInput: string) => {
    if (!insertAfterPanel) return
    await onInsertPanel(storyboardId, insertAfterPanel.id, userInput)
    handleCloseInsertModal()
  }, [handleCloseInsertModal, insertAfterPanel, onInsertPanel, storyboardId])

  const handleOpenVariantModal = useCallback((panelIndex: number) => {
    const panel = textPanels[panelIndex]
    if (!panel) return
    setVariantModalPanel({
      id: panel.id,
      panelNumber: panel.panel_number,
      description: panel.description,
      imageUrl: panel.imageUrl ?? null,
      storyboardId,
    })
  }, [storyboardId, textPanels])

  const handleCloseVariantModal = useCallback(() => {
    setVariantModalPanel(null)
  }, [])

  const handleVariant = useCallback(async (variant: VariantData, options: VariantOptions) => {
    if (!variantModalPanel) return
    await onPanelVariant(
      variantModalPanel.id,
      variantModalPanel.storyboardId,
      variantModalPanel.id,
      variant,
      options,
    )
    setVariantModalPanel(null)
  }, [onPanelVariant, variantModalPanel])

  return {
    insertModalOpen,
    insertAfterPanel,
    nextPanelForInsert,
    variantModalPanel,
    handleOpenInsertModal,
    handleCloseInsertModal,
    handleInsert,
    handleOpenVariantModal,
    handleCloseVariantModal,
    handleVariant,
  }
}
