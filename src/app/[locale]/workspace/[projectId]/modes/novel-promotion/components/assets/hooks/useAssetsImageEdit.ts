'use client'

import { useCallback } from 'react'
import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { isAbortError } from '@/lib/error-utils'
import {
  useModifyProjectCharacterImage,
  useModifyProjectLocationImage,
  useUndoProjectCharacterImage,
  useUndoProjectLocationImage,
  useUpdateProjectAppearanceDescription,
  useUpdateProjectLocationDescription,
} from '@/lib/query/hooks'

type ToastType = 'success' | 'warning' | 'error'

type ShowToast = (message: string, type?: ToastType, duration?: number) => void
type TranslateValues = Record<string, string | number | Date>
type Translate = (key: string, values?: TranslateValues) => string

interface EditingAppearanceState {
  characterId: string
  appearanceId: string
  descriptionIndex?: number
}

interface EditingLocationState {
  locationId: string
}

interface LocationImageEditState {
  locationId: string
  imageIndex: number
  locationName: string
}

interface CharacterImageEditState {
  characterId: string
  appearanceId: string
  imageIndex: number
  characterName: string
}

interface UseAssetsImageEditParams {
  projectId: string
  t: Translate
  showToast: ShowToast
  onRefresh: () => void | Promise<void>
  editingAppearance: EditingAppearanceState | null
  editingLocation: EditingLocationState | null
  imageEditModal: LocationImageEditState | null
  characterImageEditModal: CharacterImageEditState | null
  closeEditingAppearance: () => void
  closeEditingLocation: () => void
  closeImageEditModal: () => void
  closeCharacterImageEditModal: () => void
}

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)

export function useAssetsImageEdit({
  projectId,
  t,
  showToast,
  onRefresh,
  editingAppearance,
  editingLocation,
  imageEditModal,
  characterImageEditModal,
  closeEditingAppearance,
  closeEditingLocation,
  closeImageEditModal,
  closeCharacterImageEditModal,
}: UseAssetsImageEditParams) {
  const modifyCharacterImage = useModifyProjectCharacterImage(projectId)
  const modifyLocationImage = useModifyProjectLocationImage(projectId)
  const undoCharacterImage = useUndoProjectCharacterImage(projectId)
  const undoLocationImage = useUndoProjectLocationImage(projectId)
  const updateAppearanceDescription = useUpdateProjectAppearanceDescription(projectId)
  const updateLocationDescription = useUpdateProjectLocationDescription(projectId)

  const handleUndoCharacter = useCallback(async (characterId: string, appearanceId: string) => {
    if (!confirm(t('image.undoConfirm'))) return
    try {
      await undoCharacterImage.mutateAsync({ characterId, appearanceId })
      showToast(t('image.undoSuccess'), 'success')
      await Promise.resolve(onRefresh())
    } catch (error: unknown) {
      if (isAbortError(error)) {
        await Promise.resolve(onRefresh())
        return
      }
      showToast(`${t('image.undoFailed')}: ${getErrorMessage(error)}`, 'error')
    }
  }, [onRefresh, showToast, t, undoCharacterImage])

  const handleUndoLocation = useCallback(async (locationId: string) => {
    if (!confirm(t('image.undoConfirm'))) return
    try {
      await undoLocationImage.mutateAsync(locationId)
      showToast(t('image.undoSuccess'), 'success')
      await Promise.resolve(onRefresh())
    } catch (error: unknown) {
      if (isAbortError(error)) {
        await Promise.resolve(onRefresh())
        return
      }
      showToast(`${t('image.undoFailed')}: ${getErrorMessage(error)}`, 'error')
    }
  }, [onRefresh, showToast, t, undoLocationImage])

  const handleLocationImageEdit = useCallback(async (modifyPrompt: string, extraImageUrls?: string[]) => {
    if (!imageEditModal) return
    const { locationId, imageIndex, locationName } = imageEditModal

    closeImageEditModal()

    _ulogInfo(`[场景编辑] 开始编辑 ${locationName}, locationId=${locationId}, imageIndex=${imageIndex}`)

    modifyLocationImage.mutate(
      { locationId, imageIndex, modifyPrompt, extraImageUrls },
      {
        onSuccess: (data) => {
          const result = (data || {}) as { descriptionUpdated?: boolean }
          _ulogInfo(`[场景编辑] ✅ 完成: ${locationName}`)
          const descNote = result.descriptionUpdated ? t('stage.updateSuccess') : ''
          showToast(`${locationName} ${t('image.editSuccess')}${descNote}`, 'success')
        },
        onError: (error: unknown) => {
          _ulogInfo(`[场景编辑] ❌ 失败: ${locationName}`, error)
          if (isAbortError(error)) return
          showToast(`${t('image.editFailed')}: ${getErrorMessage(error)}`, 'error')
        },
      },
    )
  }, [closeImageEditModal, imageEditModal, modifyLocationImage, showToast, t])

  const handleCharacterImageEdit = useCallback(async (modifyPrompt: string, extraImageUrls?: string[]) => {
    if (!characterImageEditModal) return
    const { characterId, appearanceId, imageIndex, characterName } = characterImageEditModal

    closeCharacterImageEditModal()

    _ulogInfo(`[角色编辑] 开始编辑 ${characterName}, characterId=${characterId}, appearanceId=${appearanceId}, imageIndex=${imageIndex}`)

    modifyCharacterImage.mutate(
      { characterId, appearanceId, imageIndex, modifyPrompt, extraImageUrls },
      {
        onSuccess: (data) => {
          const result = (data || {}) as { descriptionUpdated?: boolean }
          _ulogInfo(`[角色编辑] ✅ 完成: ${characterName}`)
          const descNote = result.descriptionUpdated ? t('stage.updateSuccess') : ''
          showToast(`${characterName} ${t('image.editSuccess')}${descNote}`, 'success')
        },
        onError: (error: unknown) => {
          _ulogInfo(`[角色编辑] ❌ 失败: ${characterName}`, error)
          if (isAbortError(error)) return
          showToast(`${t('image.editFailed')}: ${getErrorMessage(error)}`, 'error')
        },
      },
    )
  }, [characterImageEditModal, closeCharacterImageEditModal, modifyCharacterImage, showToast, t])

  const handleUpdateAppearanceDescription = useCallback(async (newDescription: string) => {
    if (!editingAppearance) return
    const { characterId, appearanceId, descriptionIndex } = editingAppearance
    try {
      await updateAppearanceDescription.mutateAsync({
        characterId,
        appearanceId,
        description: newDescription,
        descriptionIndex,
      })
      closeEditingAppearance()
      await Promise.resolve(onRefresh())
    } catch (error: unknown) {
      if (!isAbortError(error)) {
        alert(`${t('character.updateFailed')}: ${getErrorMessage(error)}`)
      }
    }
  }, [closeEditingAppearance, editingAppearance, onRefresh, t, updateAppearanceDescription])

  const handleUpdateLocationDescription = useCallback(async (newDescription: string) => {
    if (!editingLocation) return
    try {
      await updateLocationDescription.mutateAsync({
        locationId: editingLocation.locationId,
        description: newDescription,
      })
      closeEditingLocation()
      await Promise.resolve(onRefresh())
    } catch (error: unknown) {
      if (!isAbortError(error)) {
        alert(`${t('location.updateFailed')}: ${getErrorMessage(error)}`)
      }
    }
  }, [closeEditingLocation, editingLocation, onRefresh, t, updateLocationDescription])

  return {
    handleUndoCharacter,
    handleUndoLocation,
    handleLocationImageEdit,
    handleCharacterImageEdit,
    handleUpdateAppearanceDescription,
    handleUpdateLocationDescription,
  }
}
