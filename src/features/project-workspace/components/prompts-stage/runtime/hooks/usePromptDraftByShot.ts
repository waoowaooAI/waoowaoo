'use client'

import { useState } from 'react'
import type {
  PromptEditingTarget,
  PromptShotEditState,
} from '../promptStageRuntime.types'

export function usePromptDraftByShot() {
  const [editingPrompt, setEditingPrompt] = useState<PromptEditingTarget | null>(null)
  const [shotEditStates, setShotEditStates] = useState<Record<string, PromptShotEditState>>({})

  const currentEditState = editingPrompt ? shotEditStates[editingPrompt.shotId] : null
  const editValue = currentEditState?.editValue || ''
  const aiModifyInstruction = currentEditState?.aiModifyInstruction || ''
  const selectedAssets = currentEditState?.selectedAssets || []
  const showAssetPicker = currentEditState?.showAssetPicker || false

  const removeShotEditState = (shotId: string) => {
    setShotEditStates((previous) => {
      const next = { ...previous }
      delete next[shotId]
      return next
    })
  }

  const clearCurrentEdit = () => {
    if (editingPrompt) {
      removeShotEditState(editingPrompt.shotId)
    }
    setEditingPrompt(null)
  }

  const handleStartEdit = (shotId: string, field: 'imagePrompt', currentValue: string) => {
    setEditingPrompt({ shotId, field })
    setShotEditStates((previous) => ({
      ...previous,
      [shotId]: {
        editValue: currentValue,
        aiModifyInstruction: previous[shotId]?.aiModifyInstruction || '',
        selectedAssets: previous[shotId]?.selectedAssets || [],
        showAssetPicker: false,
      },
    }))
  }

  const handleEditValueChange = (value: string) => {
    if (!editingPrompt) return

    setShotEditStates((previous) => ({
      ...previous,
      [editingPrompt.shotId]: {
        ...previous[editingPrompt.shotId],
        editValue: value,
      },
    }))
  }

  return {
    editingPrompt,
    setEditingPrompt,
    shotEditStates,
    setShotEditStates,
    editValue,
    aiModifyInstruction,
    selectedAssets,
    showAssetPicker,
    handleStartEdit,
    handleEditValueChange,
    removeShotEditState,
    clearCurrentEdit,
  }
}
