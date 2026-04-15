'use client'

import type { PanelEditData } from '../../PanelEditForm'
import { useRefreshProjectAssets } from '@/lib/query/hooks'
import { usePanelCrudActions } from './usePanelCrudActions'
import { usePanelInsertActions } from './usePanelInsertActions'
import { useStoryboardGroupActions } from './useStoryboardGroupActions'

interface UsePanelOperationsProps {
  projectId: string
  episodeId: string
  panelEditsRef: React.MutableRefObject<Record<string, PanelEditData>>
}

export function usePanelOperations({
  projectId,
  episodeId,
  panelEditsRef,
}: UsePanelOperationsProps) {
  const onRefresh = useRefreshProjectAssets(projectId)

  const panelCrud = usePanelCrudActions({
    projectId,
    panelEditsRef,
    onRefresh,
  })

  const groupActions = useStoryboardGroupActions({
    projectId,
    episodeId,
    onRefresh,
  })

  const panelInsert = usePanelInsertActions({
    projectId,
    onRefresh,
  })

  return {
    savingPanels: panelCrud.savingPanels,
    deletingPanelIds: panelCrud.deletingPanelIds,
    saveStateByPanel: panelCrud.saveStateByPanel,
    hasUnsavedByPanel: panelCrud.hasUnsavedByPanel,
    submittingStoryboardTextIds: groupActions.submittingStoryboardTextIds,
    addingStoryboardGroup: groupActions.addingStoryboardGroup,
    movingClipId: groupActions.movingClipId,
    insertingAfterPanelId: panelInsert.insertingAfterPanelId,

    savePanel: panelCrud.savePanel,
    savePanelWithData: panelCrud.savePanelWithData,
    debouncedSave: panelCrud.debouncedSave,
    retrySave: panelCrud.retrySave,
    addPanel: panelCrud.addPanel,
    deletePanel: panelCrud.deletePanel,
    deleteStoryboard: groupActions.deleteStoryboard,
    regenerateStoryboardText: groupActions.regenerateStoryboardText,
    addStoryboardGroup: groupActions.addStoryboardGroup,
    moveStoryboardGroup: groupActions.moveStoryboardGroup,
    addCharacterToPanel: panelCrud.addCharacterToPanel,
    removeCharacterFromPanel: panelCrud.removeCharacterFromPanel,
    setPanelLocation: panelCrud.setPanelLocation,
    insertPanel: panelInsert.insertPanel,
  }
}
