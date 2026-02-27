import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import {
  clearTaskTargetOverlay,
  upsertTaskTargetOverlay,
} from '../task-target-overlay'
import { queryKeys } from '../keys'
import type { GlobalCharacter } from '../hooks/useGlobalAssets'
import {
  requestJsonWithError,
  requestVoidWithError,
} from './mutation-shared'
import {
  GLOBAL_ASSET_PROJECT_ID,
  invalidateGlobalCharacters,
} from './asset-hub-mutations-shared'

interface SelectCharacterImageContext {
  previousQueries: Array<{
    queryKey: readonly unknown[]
    data: GlobalCharacter[] | undefined
  }>
  targetKey: string
  requestId: number
}

interface DeleteCharacterContext {
  previousQueries: Array<{
    queryKey: readonly unknown[]
    data: GlobalCharacter[] | undefined
  }>
}

function applyCharacterSelection(
  characters: GlobalCharacter[] | undefined,
  characterId: string,
  appearanceIndex: number,
  imageIndex: number | null,
): GlobalCharacter[] | undefined {
  if (!characters) return characters
  return characters.map((character) => {
    if (character.id !== characterId) return character
    return {
      ...character,
      appearances: (character.appearances || []).map((appearance) => {
        if (appearance.appearanceIndex !== appearanceIndex) return appearance
        const selectedUrl =
          imageIndex !== null && imageIndex >= 0
            ? (appearance.imageUrls[imageIndex] ?? null)
            : null
        return {
          ...appearance,
          selectedIndex: imageIndex,
          imageUrl: selectedUrl ?? appearance.imageUrl ?? null,
        }
      }),
    }
  })
}

function captureCharacterQuerySnapshots(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient
    .getQueriesData<GlobalCharacter[]>({
      queryKey: queryKeys.globalAssets.characters(),
      exact: false,
    })
    .map(([queryKey, data]) => ({ queryKey, data }))
}

function restoreCharacterQuerySnapshots(
  queryClient: ReturnType<typeof useQueryClient>,
  snapshots: Array<{ queryKey: readonly unknown[]; data: GlobalCharacter[] | undefined }>,
) {
  snapshots.forEach((snapshot) => {
    queryClient.setQueryData(snapshot.queryKey, snapshot.data)
  })
}

export function useGenerateCharacterImage() {
  const queryClient = useQueryClient()
  const invalidateCharacters = () => invalidateGlobalCharacters(queryClient)

  return useMutation({
    mutationFn: async ({ characterId, appearanceIndex }: { characterId: string; appearanceIndex: number }) => {
      return await requestJsonWithError('/api/asset-hub/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'character',
          id: characterId,
          appearanceIndex,
        }),
      }, 'Failed to generate image')
    },
    onMutate: ({ characterId }) => {
      upsertTaskTargetOverlay(queryClient, {
        projectId: GLOBAL_ASSET_PROJECT_ID,
        targetType: 'GlobalCharacter',
        targetId: characterId,
        intent: 'generate',
      })
    },
    onError: (_error, { characterId }) => {
      clearTaskTargetOverlay(queryClient, {
        projectId: GLOBAL_ASSET_PROJECT_ID,
        targetType: 'GlobalCharacter',
        targetId: characterId,
      })
    },
    onSettled: invalidateCharacters,
  })
}

export function useModifyCharacterImage() {
  const queryClient = useQueryClient()
  const invalidateCharacters = () => invalidateGlobalCharacters(queryClient)

  return useMutation({
    mutationFn: async ({
      characterId,
      appearanceIndex,
      imageIndex,
      modifyPrompt,
      extraImageUrls,
    }: {
      characterId: string
      appearanceIndex: number
      imageIndex: number
      modifyPrompt: string
      extraImageUrls?: string[]
    }) => {
      return await requestJsonWithError('/api/asset-hub/modify-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'character',
          id: characterId,
          appearanceIndex,
          imageIndex,
          modifyPrompt,
          extraImageUrls,
        }),
      }, 'Failed to modify image')
    },
    onMutate: ({ characterId, appearanceIndex, imageIndex }) => {
      upsertTaskTargetOverlay(queryClient, {
        projectId: GLOBAL_ASSET_PROJECT_ID,
        targetType: 'GlobalCharacterAppearance',
        targetId: `${characterId}:${appearanceIndex}:${imageIndex}`,
        intent: 'modify',
      })
    },
    onError: (_error, { characterId, appearanceIndex, imageIndex }) => {
      clearTaskTargetOverlay(queryClient, {
        projectId: GLOBAL_ASSET_PROJECT_ID,
        targetType: 'GlobalCharacterAppearance',
        targetId: `${characterId}:${appearanceIndex}:${imageIndex}`,
      })
    },
    onSettled: invalidateCharacters,
  })
}

export function useSelectCharacterImage() {
  const queryClient = useQueryClient()
  const latestRequestIdByTargetRef = useRef<Record<string, number>>({})
  const invalidateCharacters = () => invalidateGlobalCharacters(queryClient)

  return useMutation({
    mutationFn: async ({
      characterId,
      appearanceIndex,
      imageIndex,
      confirm = false,
    }: {
      characterId: string
      appearanceIndex: number
      imageIndex: number | null
      confirm?: boolean
    }) => {
      return await requestJsonWithError('/api/asset-hub/select-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'character',
          id: characterId,
          appearanceIndex,
          imageIndex,
          confirm,
        }),
      }, 'Failed to select image')
    },
    onMutate: async (variables): Promise<SelectCharacterImageContext> => {
      const targetKey = `${variables.characterId}:${variables.appearanceIndex}`
      const requestId = (latestRequestIdByTargetRef.current[targetKey] ?? 0) + 1
      latestRequestIdByTargetRef.current[targetKey] = requestId

      await queryClient.cancelQueries({
        queryKey: queryKeys.globalAssets.characters(),
        exact: false,
      })
      const previousQueries = captureCharacterQuerySnapshots(queryClient)

      queryClient.setQueriesData<GlobalCharacter[] | undefined>(
        {
          queryKey: queryKeys.globalAssets.characters(),
          exact: false,
        },
        (previous) => applyCharacterSelection(
          previous,
          variables.characterId,
          variables.appearanceIndex,
          variables.imageIndex,
        ),
      )

      return {
        previousQueries,
        targetKey,
        requestId,
      }
    },
    onError: (_error, _variables, context) => {
      if (!context) return
      const latestRequestId = latestRequestIdByTargetRef.current[context.targetKey]
      if (latestRequestId !== context.requestId) return
      restoreCharacterQuerySnapshots(queryClient, context.previousQueries)
    },
    onSettled: (_data, _error, variables) => {
      if (variables.confirm) {
        void invalidateCharacters()
      }
    },
  })
}

export function useUndoCharacterImage() {
  const queryClient = useQueryClient()
  const invalidateCharacters = () => invalidateGlobalCharacters(queryClient)

  return useMutation({
    mutationFn: async ({ characterId, appearanceIndex }: { characterId: string; appearanceIndex: number }) => {
      return await requestJsonWithError('/api/asset-hub/undo-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'character',
          id: characterId,
          appearanceIndex,
        }),
      }, 'Failed to undo image')
    },
    onSuccess: invalidateCharacters,
  })
}

export function useUploadCharacterImage() {
  const queryClient = useQueryClient()
  const invalidateCharacters = () => invalidateGlobalCharacters(queryClient)

  return useMutation({
    mutationFn: async ({
      file,
      characterId,
      appearanceIndex,
      labelText,
      imageIndex,
    }: {
      file: File
      characterId: string
      appearanceIndex: number
      labelText: string
      imageIndex?: number
    }) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', 'character')
      formData.append('id', characterId)
      formData.append('appearanceIndex', appearanceIndex.toString())
      formData.append('labelText', labelText)
      if (imageIndex !== undefined) {
        formData.append('imageIndex', imageIndex.toString())
      }

      return await requestJsonWithError('/api/asset-hub/upload-image', {
        method: 'POST',
        body: formData,
      }, 'Failed to upload image')
    },
    onSuccess: invalidateCharacters,
  })
}

export function useDeleteCharacter() {
  const queryClient = useQueryClient()
  const invalidateCharacters = () => invalidateGlobalCharacters(queryClient)

  return useMutation({
    mutationFn: async (characterId: string) => {
      await requestVoidWithError(
        `/api/asset-hub/characters/${characterId}`,
        { method: 'DELETE' },
        'Failed to delete character',
      )
    },
    onMutate: async (characterId): Promise<DeleteCharacterContext> => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.globalAssets.characters(),
        exact: false,
      })
      const previousQueries = captureCharacterQuerySnapshots(queryClient)

      queryClient.setQueriesData<GlobalCharacter[] | undefined>(
        {
          queryKey: queryKeys.globalAssets.characters(),
          exact: false,
        },
        (previous) => previous?.filter((character) => character.id !== characterId),
      )

      return { previousQueries }
    },
    onError: (_error, _characterId, context) => {
      if (!context) return
      restoreCharacterQuerySnapshots(queryClient, context.previousQueries)
    },
    onSettled: invalidateCharacters,
  })
}

export function useDeleteCharacterAppearance() {
  const queryClient = useQueryClient()
  const invalidateCharacters = () => invalidateGlobalCharacters(queryClient)

  return useMutation({
    mutationFn: async ({ characterId, appearanceIndex }: { characterId: string; appearanceIndex: number }) => {
      await requestVoidWithError(
        `/api/asset-hub/appearances?characterId=${characterId}&appearanceIndex=${appearanceIndex}`,
        { method: 'DELETE' },
        'Failed to delete appearance',
      )
    },
    onSuccess: invalidateCharacters,
  })
}

export function useUploadCharacterVoice() {
  const queryClient = useQueryClient()
  const invalidateCharacters = () => invalidateGlobalCharacters(queryClient)

  return useMutation({
    mutationFn: async ({ file, characterId }: { file: File; characterId: string }) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('characterId', characterId)

      return await requestJsonWithError('/api/asset-hub/character-voice', {
        method: 'POST',
        body: formData,
      }, 'Failed to upload voice')
    },
    onSuccess: invalidateCharacters,
  })
}
