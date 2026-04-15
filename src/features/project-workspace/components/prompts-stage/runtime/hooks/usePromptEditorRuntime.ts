'use client'

import { useRef, useState } from 'react'
import { shouldShowError } from '@/lib/error-utils'
import { getErrorMessage } from '../promptStageRuntime.utils'
import { usePromptAiModifyFlow } from './usePromptAiModifyFlow'
import type { PromptAiModifier } from './usePromptAiModifyFlow'
import { usePromptDraftByShot } from './usePromptDraftByShot'
import { usePromptAssetMention } from './usePromptAssetMention'

interface UsePromptEditorRuntimeParams {
  onUpdatePrompt: (shotId: string, field: 'imagePrompt', value: string) => Promise<void>
  onGenerateImage: (shotId: string, extraReferenceAssetIds?: string[]) => Promise<void> | void
  t: (key: string, values?: Record<string, string | number>) => string
  aiModifyShotPrompt: PromptAiModifier
}

export function usePromptEditorRuntime({
  onUpdatePrompt,
  onGenerateImage,
  t,
  aiModifyShotPrompt,
}: UsePromptEditorRuntimeParams) {
  const draftByShot = usePromptDraftByShot()
  const [shotExtraAssets, setShotExtraAssets] = useState<Record<string, string[]>>({})
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { aiModifyingShots, handleAiModify } = usePromptAiModifyFlow({
    editingPrompt: draftByShot.editingPrompt,
    shotEditStates: draftByShot.shotEditStates,
    onUpdatePrompt,
    onGenerateImage,
    aiModifyShotPrompt,
    setShotExtraAssets,
    setEditingPrompt: draftByShot.setEditingPrompt,
    setShotEditStates: draftByShot.setShotEditStates,
    t,
  })
  const {
    handleModifyInstructionChange,
    handleSelectAsset,
    handleRemoveSelectedAsset,
  } = usePromptAssetMention({
    editingPrompt: draftByShot.editingPrompt,
    shotEditStates: draftByShot.shotEditStates,
    setShotEditStates: draftByShot.setShotEditStates,
    textareaRef,
  })

  const handleSaveEdit = async () => {
    const currentEditingPrompt = draftByShot.editingPrompt
    if (!currentEditingPrompt) return
    const currentShotId = currentEditingPrompt.shotId
    const currentState = draftByShot.shotEditStates[currentShotId]
    if (!currentState) return

    try {
      await onUpdatePrompt(currentEditingPrompt.shotId, currentEditingPrompt.field, currentState.editValue)
      if (currentState.selectedAssets.length > 0) {
        setShotExtraAssets((previous) => ({
          ...previous,
          [currentEditingPrompt.shotId]: currentState.selectedAssets.map((asset) => asset.id),
        }))
      }

      draftByShot.setEditingPrompt((previous) => (previous?.shotId === currentShotId ? null : previous))
      draftByShot.removeShotEditState(currentShotId)
    } catch (error: unknown) {
      if (shouldShowError(error)) {
        alert(t('prompts.updateFailed', { error: getErrorMessage(error, t('common.unknownError')) }))
      }
    }
  }

  const handleCancelEdit = () => {
    draftByShot.clearCurrentEdit()
  }

  return {
    editingPrompt: draftByShot.editingPrompt,
    editValue: draftByShot.editValue,
    aiModifyInstruction: draftByShot.aiModifyInstruction,
    selectedAssets: draftByShot.selectedAssets,
    showAssetPicker: draftByShot.showAssetPicker,
    aiModifyingShots,
    textareaRef,
    shotExtraAssets,
    handleStartEdit: draftByShot.handleStartEdit,
    handleSaveEdit,
    handleCancelEdit,
    handleModifyInstructionChange,
    handleSelectAsset,
    handleAiModify,
    handleEditValueChange: draftByShot.handleEditValueChange,
    handleRemoveSelectedAsset,
  }
}
