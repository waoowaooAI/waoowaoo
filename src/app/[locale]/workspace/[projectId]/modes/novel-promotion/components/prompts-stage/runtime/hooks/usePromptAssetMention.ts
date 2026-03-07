'use client'

import type { RefObject } from 'react'
import type {
  PromptAssetReference,
  PromptEditingTarget,
  PromptShotEditState,
} from '../promptStageRuntime.types'

interface UsePromptAssetMentionParams {
  editingPrompt: PromptEditingTarget | null
  shotEditStates: Record<string, PromptShotEditState>
  setShotEditStates: React.Dispatch<React.SetStateAction<Record<string, PromptShotEditState>>>
  textareaRef: RefObject<HTMLTextAreaElement | null>
}

export function usePromptAssetMention({
  editingPrompt,
  shotEditStates,
  setShotEditStates,
  textareaRef,
}: UsePromptAssetMentionParams) {
  const handleModifyInstructionChange = (value: string) => {
    if (!editingPrompt) return

    const shotId = editingPrompt.shotId
    const currentState = shotEditStates[shotId]
    if (!currentState) return

    const lastAtIndex = value.lastIndexOf('@')
    const shouldShowPicker = lastAtIndex !== -1 && lastAtIndex === value.length - 1
    const updatedAssets = currentState.selectedAssets.filter((asset) => value.includes(`@${asset.name}`))

    setShotEditStates((previous) => ({
      ...previous,
      [shotId]: {
        ...currentState,
        aiModifyInstruction: value,
        showAssetPicker: shouldShowPicker,
        selectedAssets: updatedAssets,
      },
    }))
  }

  const handleSelectAsset = (asset: PromptAssetReference) => {
    if (!editingPrompt) return

    const shotId = editingPrompt.shotId
    const currentState = shotEditStates[shotId]
    if (!currentState) return

    const alreadySelected = currentState.selectedAssets.find((item) => item.id === asset.id)
    const lastAtIndex = currentState.aiModifyInstruction.lastIndexOf('@')
    const nextInstruction = lastAtIndex === -1
      ? currentState.aiModifyInstruction
      : `${currentState.aiModifyInstruction.substring(0, lastAtIndex)}@${asset.name}`

    setShotEditStates((previous) => ({
      ...previous,
      [shotId]: {
        ...currentState,
        aiModifyInstruction: nextInstruction,
        selectedAssets: alreadySelected ? currentState.selectedAssets : [...currentState.selectedAssets, asset],
        showAssetPicker: false,
      },
    }))

    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }

  const handleRemoveSelectedAsset = (index: number, assetName: string) => {
    if (!editingPrompt) return

    const currentState = shotEditStates[editingPrompt.shotId]
    if (!currentState) return

    const assetMention = `@${assetName}`
    const mentionPattern = new RegExp(assetMention.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
    const nextInstruction = currentState.aiModifyInstruction
      .replace(mentionPattern, '')
      .replace(/\s+/g, ' ')
      .trim()

    setShotEditStates((previous) => ({
      ...previous,
      [editingPrompt.shotId]: {
        ...currentState,
        selectedAssets: currentState.selectedAssets.filter((_, itemIndex) => itemIndex !== index),
        aiModifyInstruction: nextInstruction,
      },
    }))
  }

  return {
    handleModifyInstructionChange,
    handleSelectAsset,
    handleRemoveSelectedAsset,
  }
}
