'use client'

import InsertPanelModal from './InsertPanelModal'
import PanelVariantModal from './PanelVariantModal'
import type { VariantData, VariantOptions } from './hooks/usePanelVariant'

interface PanelRuntimeSnapshot {
  id: string
  panelNumber: number | null
  description: string | null
  imageUrl: string | null
}

interface VariantPanelRuntimeSnapshot extends PanelRuntimeSnapshot {
  storyboardId: string
}

interface StoryboardGroupDialogsProps {
  insertAfterPanel: PanelRuntimeSnapshot | null
  nextPanelForInsert: PanelRuntimeSnapshot | null
  insertModalOpen: boolean
  insertingAfterPanelId: string | null
  onCloseInsertModal: () => void
  onInsert: (userInput: string) => Promise<void>
  variantModalPanel: VariantPanelRuntimeSnapshot | null
  projectId: string
  submittingVariantPanelId: string | null
  onCloseVariantModal: () => void
  onVariant: (variant: VariantData, options: VariantOptions) => Promise<void>
}

export default function StoryboardGroupDialogs({
  insertAfterPanel,
  nextPanelForInsert,
  insertModalOpen,
  insertingAfterPanelId,
  onCloseInsertModal,
  onInsert,
  variantModalPanel,
  projectId,
  submittingVariantPanelId,
  onCloseVariantModal,
  onVariant,
}: StoryboardGroupDialogsProps) {
  return (
    <>
      {insertAfterPanel && (
        <InsertPanelModal
          isOpen={insertModalOpen}
          onClose={onCloseInsertModal}
          prevPanel={insertAfterPanel}
          nextPanel={nextPanelForInsert}
          onInsert={onInsert}
          isInserting={insertingAfterPanelId === insertAfterPanel.id}
        />
      )}

      {variantModalPanel && (
        <PanelVariantModal
          isOpen={!!variantModalPanel}
          onClose={onCloseVariantModal}
          panel={variantModalPanel}
          projectId={projectId}
          onVariant={onVariant}
          isSubmittingVariantTask={submittingVariantPanelId === variantModalPanel.id}
        />
      )}
    </>
  )
}
