'use client'

import { useState } from 'react'
import { shouldShowError } from '@/lib/error-utils'
import { getErrorMessage } from '../promptStageRuntime.utils'
import type { PromptAssetReference, PromptShotEditState } from '../promptStageRuntime.types'

interface ModifyShotPromptResult {
  modifiedImagePrompt: string
}

export interface PromptAiModifier {
  mutateAsync: (payload: {
    currentPrompt: string
    currentVideoPrompt: string
    modifyInstruction: string
    referencedAssets: PromptAssetReference[]
  }) => Promise<ModifyShotPromptResult>
}

interface UsePromptAiModifyFlowParams {
  editingPrompt: { shotId: string; field: 'imagePrompt' } | null
  shotEditStates: Record<string, PromptShotEditState>
  onUpdatePrompt: (shotId: string, field: 'imagePrompt', value: string) => Promise<void>
  onGenerateImage: (shotId: string, extraReferenceAssetIds?: string[]) => Promise<void> | void
  aiModifyShotPrompt: PromptAiModifier
  setShotExtraAssets: React.Dispatch<React.SetStateAction<Record<string, string[]>>>
  setEditingPrompt: React.Dispatch<React.SetStateAction<{ shotId: string; field: 'imagePrompt' } | null>>
  setShotEditStates: React.Dispatch<React.SetStateAction<Record<string, PromptShotEditState>>>
  t: (key: string, values?: Record<string, string | number>) => string
}

export function usePromptAiModifyFlow({
  editingPrompt,
  shotEditStates,
  onUpdatePrompt,
  onGenerateImage,
  aiModifyShotPrompt,
  setShotExtraAssets,
  setEditingPrompt,
  setShotEditStates,
  t,
}: UsePromptAiModifyFlowParams) {
  const [aiModifyingShots, setAiModifyingShots] = useState<Set<string>>(new Set())

  const handleAiModify = async () => {
    if (!editingPrompt) return
    const shotId = editingPrompt.shotId
    const currentState = shotEditStates[shotId]
    if (!currentState || !currentState.aiModifyInstruction.trim()) {
      alert(t('prompts.enterInstruction'))
      return
    }

    const snapshotEditValue = currentState.editValue
    const snapshotAiInstruction = currentState.aiModifyInstruction
    const snapshotSelectedAssets = currentState.selectedAssets

    try {
      setAiModifyingShots((previous) => new Set(previous).add(shotId))
      const data = await aiModifyShotPrompt.mutateAsync({
        currentPrompt: snapshotEditValue,
        currentVideoPrompt: '',
        modifyInstruction: snapshotAiInstruction,
        referencedAssets: snapshotSelectedAssets,
      })
      await onUpdatePrompt(shotId, 'imagePrompt', data.modifiedImagePrompt)

      const assetIds = snapshotSelectedAssets.map((asset) => asset.id)
      if (assetIds.length > 0) {
        setShotExtraAssets((previous) => ({
          ...previous,
          [shotId]: assetIds,
        }))
      }

      setEditingPrompt((previous) => (previous?.shotId === shotId ? null : previous))
      setShotEditStates((previous) => {
        const next = { ...previous }
        delete next[shotId]
        return next
      })

      await onGenerateImage(shotId, assetIds.length > 0 ? assetIds : undefined)
    } catch (error: unknown) {
      if (shouldShowError(error)) {
        alert(t('prompts.modifyFailed', { error: getErrorMessage(error, t('common.unknownError')) }))
      }
    } finally {
      setAiModifyingShots((previous) => {
        const next = new Set(previous)
        next.delete(shotId)
        return next
      })
    }
  }

  return {
    aiModifyingShots,
    handleAiModify,
  }
}
