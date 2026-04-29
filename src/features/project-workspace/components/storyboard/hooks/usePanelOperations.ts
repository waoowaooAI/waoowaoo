'use client'

import type { PanelEditData } from '../../PanelEditForm'
import type { ProjectStoryboard } from '@/types/project'
import { useCallback } from 'react'
import { useRefreshEpisodeData, useRefreshProjectAssets, useRefreshStoryboards } from '@/lib/query/hooks'
import { usePanelCrudActions } from './usePanelCrudActions'
import { usePanelInsertActions } from './usePanelInsertActions'
import { useStoryboardGroupActions } from './useStoryboardGroupActions'

interface UsePanelOperationsProps {
  projectId: string
  episodeId: string
  panelEditsRef: React.MutableRefObject<Record<string, PanelEditData>>
  setLocalStoryboards: React.Dispatch<React.SetStateAction<ProjectStoryboard[]>>
}

export function usePanelOperations({
  projectId,
  episodeId,
  panelEditsRef,
  setLocalStoryboards,
}: UsePanelOperationsProps) {
  const refreshProjectAssets = useRefreshProjectAssets(projectId)
  const refreshEpisodeData = useRefreshEpisodeData(projectId, episodeId)
  const refreshStoryboards = useRefreshStoryboards(episodeId)

  const onRefresh = useCallback(async () => {
    await Promise.all([
      refreshProjectAssets(),
      refreshEpisodeData(),
      refreshStoryboards(),
    ])
  }, [refreshEpisodeData, refreshProjectAssets, refreshStoryboards])

  const panelCrud = usePanelCrudActions({
    projectId,
    episodeId,
    panelEditsRef,
    onRefresh,
  })

  const groupActions = useStoryboardGroupActions({
    projectId,
    episodeId,
    onRefresh,
    setLocalStoryboards,
  })

  const panelInsert = usePanelInsertActions({
    projectId,
    episodeId,
    onRefresh,
  })

  return {
    savingPanels: panelCrud.savingPanels,
    deletingPanelIds: panelCrud.deletingPanelIds,
    copyingPanelIds: panelCrud.copyingPanelIds,
    saveStateByPanel: panelCrud.saveStateByPanel,
    hasUnsavedByPanel: panelCrud.hasUnsavedByPanel,
    submittingStoryboardTextIds: groupActions.submittingStoryboardTextIds,
    addingStoryboardGroup: groupActions.addingStoryboardGroup,
    copyingStoryboardId: groupActions.copyingStoryboardId,
    movingClipId: groupActions.movingClipId,
    insertingAfterPanelId: panelInsert.insertingAfterPanelId,

    savePanel: panelCrud.savePanel,
    savePanelWithData: panelCrud.savePanelWithData,
    debouncedSave: panelCrud.debouncedSave,
    retrySave: panelCrud.retrySave,
    addPanel: panelCrud.addPanel,
    copyPanel: panelCrud.copyPanel,
    deletePanel: panelCrud.deletePanel,
    deleteStoryboard: groupActions.deleteStoryboard,
    regenerateStoryboardText: groupActions.regenerateStoryboardText,
    addStoryboardGroup: groupActions.addStoryboardGroup,
    copyStoryboardGroup: groupActions.copyStoryboardGroup,
    moveStoryboardGroup: groupActions.moveStoryboardGroup,
    addCharacterToPanel: panelCrud.addCharacterToPanel,
    removeCharacterFromPanel: panelCrud.removeCharacterFromPanel,
    setPanelLocation: panelCrud.setPanelLocation,
    insertPanel: panelInsert.insertPanel,
  }
}
