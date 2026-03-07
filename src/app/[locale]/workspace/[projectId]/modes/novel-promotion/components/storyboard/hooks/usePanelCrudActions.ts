'use client'
import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
import { useTranslations } from 'next-intl'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PanelEditData } from '../../PanelEditForm'
import type { StoryboardPanel } from './useStoryboardState'
import type { NovelPromotionStoryboard } from '@/types/project'
import {
  PanelSaveCoordinator,
  type PanelSaveState,
  type PanelSaveStatus,
} from './panel-save-coordinator'
import {
  useCreateProjectPanel,
  useDeleteProjectPanel,
  useUpdateProjectPanel,
} from '@/lib/query/hooks'
import {
  getErrorMessage,
  getStoryboardPanels,
  isAbortError,
} from './panel-operations-shared'
import { syncPanelCharacterDependentJson } from '@/lib/novel-promotion/panel-ai-data-sync'

interface UsePanelCrudActionsProps {
  projectId: string
  panelEditsRef: React.MutableRefObject<Record<string, PanelEditData>>
  onRefresh: () => Promise<void> | void
}

export type { PanelSaveState, PanelSaveStatus }

export function usePanelCrudActions({
  projectId,
  panelEditsRef,
  onRefresh,
}: UsePanelCrudActionsProps) {
  const t = useTranslations('storyboard')
  const [savingPanels, setSavingPanels] = useState<Set<string>>(new Set())
  const [deletingPanelIds, setDeletingPanelIds] = useState<Set<string>>(new Set())
  const [saveStateByPanel, setSaveStateByPanel] = useState<Record<string, PanelSaveState>>({})
  const saveTimeouts = useRef<Record<string, NodeJS.Timeout>>({})
  const panelSaveCoordinatorRef = useRef<PanelSaveCoordinator | null>(null)

  const savePanelMutation = useUpdateProjectPanel(projectId)
  const createPanelMutation = useCreateProjectPanel(projectId)
  const deletePanelMutation = useDeleteProjectPanel(projectId)

  const setPanelSaveState = useCallback((panelId: string, nextState: PanelSaveState) => {
    setSaveStateByPanel((previous) => {
      const previousState = previous[panelId]
      if (
        previousState
        && previousState.status === nextState.status
        && previousState.errorMessage === nextState.errorMessage
      ) {
        return previous
      }
      return {
        ...previous,
        [panelId]: nextState,
      }
    })
  }, [])

  if (!panelSaveCoordinatorRef.current) {
    panelSaveCoordinatorRef.current = new PanelSaveCoordinator({
      onSavingChange: (panelId, isSaving) => {
        setSavingPanels((previous) => {
          const next = new Set(previous)
          if (isSaving) {
            next.add(panelId)
          } else {
            next.delete(panelId)
          }
          return next
        })
      },
      onStateChange: setPanelSaveState,
      runSave: async ({ storyboardId, snapshot }) => {
        await savePanelMutation.mutateAsync({
          storyboardId,
          panelIndex: snapshot.panelIndex,
          id: snapshot.id,
          panelNumber: snapshot.panelNumber,
          shotType: snapshot.shotType,
          cameraMove: snapshot.cameraMove,
          description: snapshot.description,
          location: snapshot.location,
          characters: JSON.stringify(snapshot.characters),
          srtStart: snapshot.srtStart,
          srtEnd: snapshot.srtEnd,
          duration: snapshot.duration,
          videoPrompt: snapshot.videoPrompt,
          photographyRules: snapshot.photographyRules,
          actingNotes: snapshot.actingNotes,
        })
      },
      resolveErrorMessage: (error) => {
        _ulogError('保存失败:', error)
        return getErrorMessage(error, t('common.unknownError'))
      },
    })
  }

  panelSaveCoordinatorRef.current.updateCallbacks({
    onSavingChange: (panelId, isSaving) => {
      setSavingPanels((previous) => {
        const next = new Set(previous)
        if (isSaving) {
          next.add(panelId)
        } else {
          next.delete(panelId)
        }
        return next
      })
    },
    onStateChange: setPanelSaveState,
    runSave: async ({ storyboardId, snapshot }) => {
      await savePanelMutation.mutateAsync({
        storyboardId,
        panelIndex: snapshot.panelIndex,
        id: snapshot.id,
        panelNumber: snapshot.panelNumber,
        shotType: snapshot.shotType,
        cameraMove: snapshot.cameraMove,
        description: snapshot.description,
        location: snapshot.location,
        characters: JSON.stringify(snapshot.characters),
        srtStart: snapshot.srtStart,
        srtEnd: snapshot.srtEnd,
        duration: snapshot.duration,
        videoPrompt: snapshot.videoPrompt,
        photographyRules: snapshot.photographyRules,
        actingNotes: snapshot.actingNotes,
      })
    },
    resolveErrorMessage: (error) => {
      _ulogError('保存失败:', error)
      return getErrorMessage(error, t('common.unknownError'))
    },
  })

  const queuePanelSave = useCallback((
    panelId: string,
    storyboardId: string,
    snapshotOverride?: PanelEditData,
  ): Promise<void> | null => {
    const sourceSnapshot = snapshotOverride ?? panelEditsRef.current[panelId]
    return panelSaveCoordinatorRef.current?.queue(panelId, storyboardId, sourceSnapshot) ?? null
  }, [panelEditsRef])

  const savePanel = useCallback(async (storyboardId: string, panelIdOrData: string | PanelEditData) => {
    const panelId = typeof panelIdOrData === 'string' ? panelIdOrData : panelIdOrData.id
    if (!panelId) return
    const queued = queuePanelSave(
      panelId,
      storyboardId,
      typeof panelIdOrData === 'string' ? undefined : panelIdOrData,
    )
    if (queued) {
      await queued
    }
  }, [queuePanelSave])

  const debouncedSave = useCallback((panelId: string, storyboardId: string) => {
    if (saveTimeouts.current[panelId]) {
      clearTimeout(saveTimeouts.current[panelId])
    }
    saveTimeouts.current[panelId] = setTimeout(() => {
      void queuePanelSave(panelId, storyboardId)
    }, 500)
  }, [queuePanelSave])

  useEffect(() => () => {
    Object.values(saveTimeouts.current).forEach((timeoutId) => clearTimeout(timeoutId))
  }, [])

  const retrySave = useCallback((panelId: string) => {
    if (saveTimeouts.current[panelId]) {
      clearTimeout(saveTimeouts.current[panelId])
      delete saveTimeouts.current[panelId]
    }

    const latestSnapshot = panelEditsRef.current[panelId]
    const queued = panelSaveCoordinatorRef.current?.retry(panelId, latestSnapshot)
    if (queued) {
      void queued
    }
  }, [panelEditsRef])

  const hasUnsavedByPanel = useMemo(() => {
    const panelIds = Object.entries(saveStateByPanel)
      .filter(([, state]) => state.status === 'error')
      .map(([panelId]) => panelId)
    return new Set(panelIds)
  }, [saveStateByPanel])

  const addPanel = useCallback(async (storyboardId: string) => {
    try {
      await createPanelMutation.mutateAsync({
        storyboardId,
        shotType: t('variant.defaultShotType'),
        cameraMove: t('variant.defaultCameraMove'),
        description: t('panel.newPanelDescription'),
        videoPrompt: '',
        characters: '[]',
      })
      await onRefresh()
    } catch (error: unknown) {
      _ulogError('添加分镜失败:', error)
      alert(
        t('messages.addPanelFailed', {
          error: getErrorMessage(error, t('common.unknownError')),
        }),
      )
    }
  }, [createPanelMutation, onRefresh, t])

  const deletePanel = useCallback(async (
    panelId: string,
    storyboardId: string,
    setLocalStoryboards: React.Dispatch<React.SetStateAction<NovelPromotionStoryboard[]>>,
  ) => {
    if (!confirm(t('confirm.deletePanel'))) return
    setDeletingPanelIds((previous) => new Set(previous).add(panelId))

    try {
      await deletePanelMutation.mutateAsync({ panelId })
      setLocalStoryboards((previous) => previous.map((storyboard) => {
        if (storyboard.id !== storyboardId) return storyboard
        const panels = getStoryboardPanels(storyboard)
        const updatedPanels = panels.filter((panel) => panel.id !== panelId)
        return { ...storyboard, panels: updatedPanels }
      }))
    } catch (error: unknown) {
      if (isAbortError(error)) {
        _ulogInfo('请求被中断（可能是页面刷新），后端仍在执行')
        return
      }
      alert(
        t('messages.deletePanelFailed', {
          error: getErrorMessage(error, t('common.unknownError')),
        }),
      )
    } finally {
      setDeletingPanelIds((previous) => {
        const next = new Set(previous)
        next.delete(panelId)
        return next
      })
      setSavingPanels((previous) => {
        const next = new Set(previous)
        next.delete(panelId)
        return next
      })
      setSaveStateByPanel((previous) => {
        if (!(panelId in previous)) return previous
        const rest = { ...previous }
        delete rest[panelId]
        return rest
      })
      panelSaveCoordinatorRef.current?.clear(panelId)
      if (saveTimeouts.current[panelId]) {
        clearTimeout(saveTimeouts.current[panelId])
        delete saveTimeouts.current[panelId]
      }
    }
  }, [deletePanelMutation, t])

  const addCharacterToPanel = useCallback((
    panel: StoryboardPanel,
    characterName: string,
    appearance: string,
    storyboardId: string,
    getPanelEditData: (panel: StoryboardPanel) => PanelEditData,
    updatePanelEdit: (panelId: string, panel: StoryboardPanel, updates: Partial<PanelEditData>) => void,
  ) => {
    const currentData = getPanelEditData(panel)
    const exists = currentData.characters.some(
      (item) => item.name === characterName && item.appearance === appearance,
    )
    if (exists) return
    updatePanelEdit(panel.id, panel, {
      characters: [...currentData.characters, { name: characterName, appearance }],
    })
    debouncedSave(panel.id, storyboardId)
  }, [debouncedSave])

  const removeCharacterFromPanel = useCallback((
    panel: StoryboardPanel,
    index: number,
    storyboardId: string,
    getPanelEditData: (panel: StoryboardPanel) => PanelEditData,
    updatePanelEdit: (panelId: string, panel: StoryboardPanel, updates: Partial<PanelEditData>) => void,
  ) => {
    const currentData = getPanelEditData(panel)
    const synced = syncPanelCharacterDependentJson({
      characters: currentData.characters,
      removeIndex: index,
      actingNotesJson: currentData.actingNotes,
      photographyRulesJson: currentData.photographyRules,
    })
    const updates: Partial<PanelEditData> = {
      characters: synced.characters,
    }
    if (synced.actingNotesJson !== undefined) {
      updates.actingNotes = synced.actingNotesJson
    }
    if (synced.photographyRulesJson !== undefined) {
      updates.photographyRules = synced.photographyRulesJson
    }
    updatePanelEdit(panel.id, panel, {
      ...updates,
    })
    debouncedSave(panel.id, storyboardId)
  }, [debouncedSave])

  const setPanelLocation = useCallback((
    panel: StoryboardPanel,
    locationName: string | null,
    storyboardId: string,
    updatePanelEdit: (panelId: string, panel: StoryboardPanel, updates: Partial<PanelEditData>) => void,
  ) => {
    updatePanelEdit(panel.id, panel, { location: locationName })
    debouncedSave(panel.id, storyboardId)
  }, [debouncedSave])

  return {
    savingPanels,
    deletingPanelIds,
    saveStateByPanel,
    hasUnsavedByPanel,
    savePanel,
    savePanelWithData: savePanel,
    debouncedSave,
    retrySave,
    addPanel,
    deletePanel,
    addCharacterToPanel,
    removeCharacterFromPanel,
    setPanelLocation,
  }
}
