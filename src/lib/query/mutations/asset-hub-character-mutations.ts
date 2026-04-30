import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import {
  clearTaskTargetOverlay,
  upsertTaskTargetOverlay,
} from '../task-target-overlay'
import { queryKeys } from '../keys'
import type { GlobalCharacter } from '../hooks/useGlobalAssets'
import type { AssetSummary } from '@/lib/assets/contracts'
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
  previousUnifiedQueries: Array<{
    queryKey: readonly unknown[]
    data: AssetSummary[] | undefined
  }>
  targetKey: string
  requestId: number
}

interface GenerateCharacterImageContext {
  previousQueries: Array<{
    queryKey: readonly unknown[]
    data: GlobalCharacter[] | undefined
  }>
  previousUnifiedQueries: Array<{
    queryKey: readonly unknown[]
    data: AssetSummary[] | undefined
  }>
}

type GenerateCharacterImageResponse = {
  taskId?: string | null
}

interface DeleteCharacterContext {
  previousQueries: Array<{
    queryKey: readonly unknown[]
    data: GlobalCharacter[] | undefined
  }>
  previousUnifiedQueries: Array<{
    queryKey: readonly unknown[]
    data: AssetSummary[] | undefined
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

function captureUnifiedQuerySnapshots(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient
    .getQueriesData<AssetSummary[]>({
      queryKey: queryKeys.assets.all('global'),
      exact: false,
    })
    .map(([queryKey, data]) => ({ queryKey, data }))
}

function applyUnifiedCharacterSelection(
  assets: AssetSummary[] | undefined,
  characterId: string,
  appearanceIndex: number,
  imageIndex: number | null,
): AssetSummary[] | undefined {
  if (!assets) return assets
  return assets.map((asset) => {
    if (asset.id !== characterId || asset.kind !== 'character') return asset
    return {
      ...asset,
      variants: asset.variants.map((variant) => {
        if (variant.index !== appearanceIndex) return variant
        return {
          ...variant,
          selectionState: {
            ...variant.selectionState,
            selectedRenderIndex: imageIndex,
          },
          renders: variant.renders.map((render) => ({
            ...render,
            isSelected: imageIndex !== null && render.index === imageIndex,
          })),
        }
      }),
    }
  })
}

function applyCharacterGenerationRunning(
  characters: GlobalCharacter[] | undefined,
  characterId: string,
  appearanceIndex: number,
): GlobalCharacter[] | undefined {
  if (!characters) return characters
  return characters.map((character) => {
    if (character.id !== characterId) return character
    return {
      ...character,
      appearances: (character.appearances || []).map((appearance) => {
        if (appearance.appearanceIndex !== appearanceIndex) return appearance
        return {
          ...appearance,
          imageTaskRunning: true,
        }
      }),
    }
  })
}

function applyUnifiedCharacterGenerationRunning(
  assets: AssetSummary[] | undefined,
  characterId: string,
  appearanceIndex: number,
): AssetSummary[] | undefined {
  if (!assets) return assets
  return assets.map((asset) => {
    if (asset.id !== characterId || asset.kind !== 'character') return asset
    return {
      ...asset,
      taskState: {
        isRunning: true,
        lastError: null,
      },
      variants: asset.variants.map((variant) => {
        if (variant.index !== appearanceIndex) return variant
        return {
          ...variant,
          taskState: {
            isRunning: true,
            lastError: null,
          },
        }
      }),
    }
  })
}

function restoreCharacterQuerySnapshots(
  queryClient: ReturnType<typeof useQueryClient>,
  snapshots: Array<{ queryKey: readonly unknown[]; data: GlobalCharacter[] | undefined }>,
) {
  snapshots.forEach((snapshot) => {
    queryClient.setQueryData(snapshot.queryKey, snapshot.data)
  })
}

function restoreUnifiedQuerySnapshots(
  queryClient: ReturnType<typeof useQueryClient>,
  snapshots: Array<{ queryKey: readonly unknown[]; data: AssetSummary[] | undefined }>,
) {
  snapshots.forEach((snapshot) => {
    queryClient.setQueryData(snapshot.queryKey, snapshot.data)
  })
}

export function useGenerateCharacterImage() {
  const queryClient = useQueryClient()
  const invalidateCharacters = () => invalidateGlobalCharacters(queryClient)

  return useMutation({
    mutationFn: async ({
      characterId,
      appearanceId,
      appearanceIndex,
      artStyle,
      count,
    }: {
      characterId: string
      appearanceId: string
      appearanceIndex: number
      artStyle?: string
      count?: number
    }) => {
      return await requestJsonWithError<GenerateCharacterImageResponse>(`/api/assets/${characterId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'global',
          kind: 'character',
          appearanceId,
          appearanceIndex,
          artStyle,
          count,
        }),
      }, 'Failed to generate image')
    },
    onMutate: async ({ characterId, appearanceId, appearanceIndex }): Promise<GenerateCharacterImageContext> => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.globalAssets.characters(),
        exact: false,
      })
      await queryClient.cancelQueries({
        queryKey: queryKeys.assets.all('global'),
        exact: false,
      })
      const previousQueries = captureCharacterQuerySnapshots(queryClient)
      const previousUnifiedQueries = captureUnifiedQuerySnapshots(queryClient)

      upsertTaskTargetOverlay(queryClient, {
        projectId: GLOBAL_ASSET_PROJECT_ID,
        targetType: 'GlobalCharacterAppearance',
        targetId: appearanceId,
        runningTaskType: 'asset_hub_image',
        intent: 'generate',
      })

      queryClient.setQueriesData<GlobalCharacter[] | undefined>(
        {
          queryKey: queryKeys.globalAssets.characters(),
          exact: false,
        },
        (previous) => applyCharacterGenerationRunning(
          previous,
          characterId,
          appearanceIndex,
        ),
      )

      queryClient.setQueriesData<AssetSummary[] | undefined>(
        {
          queryKey: queryKeys.assets.all('global'),
          exact: false,
        },
        (previous) => applyUnifiedCharacterGenerationRunning(
          previous,
          characterId,
          appearanceIndex,
        ),
      )

      return {
        previousQueries,
        previousUnifiedQueries,
      }
    },
    onSuccess: (data, { appearanceId }) => {
      upsertTaskTargetOverlay(queryClient, {
        projectId: GLOBAL_ASSET_PROJECT_ID,
        targetType: 'GlobalCharacterAppearance',
        targetId: appearanceId,
        runningTaskId: data.taskId ?? null,
        runningTaskType: 'asset_hub_image',
        intent: 'generate',
      })
    },
    onError: (_error, { appearanceId }, context) => {
      clearTaskTargetOverlay(queryClient, {
        projectId: GLOBAL_ASSET_PROJECT_ID,
        targetType: 'GlobalCharacterAppearance',
        targetId: appearanceId,
      })
      if (context) {
        restoreCharacterQuerySnapshots(queryClient, context.previousQueries)
        restoreUnifiedQuerySnapshots(queryClient, context.previousUnifiedQueries)
      }
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
      return await requestJsonWithError(`/api/assets/${characterId}/modify-render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'global',
          kind: 'character',
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
      return await requestJsonWithError(`/api/assets/${characterId}/select-render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'global',
          kind: 'character',
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

      if (variables.confirm) {
        return { previousQueries: [], previousUnifiedQueries: [], targetKey, requestId }
      }

      await queryClient.cancelQueries({
        queryKey: queryKeys.globalAssets.characters(),
        exact: false,
      })
      await queryClient.cancelQueries({
        queryKey: queryKeys.assets.all('global'),
        exact: false,
      })
      const previousQueries = captureCharacterQuerySnapshots(queryClient)
      const previousUnifiedQueries = captureUnifiedQuerySnapshots(queryClient)

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

      queryClient.setQueriesData<AssetSummary[] | undefined>(
        {
          queryKey: queryKeys.assets.all('global'),
          exact: false,
        },
        (previous) => applyUnifiedCharacterSelection(
          previous,
          variables.characterId,
          variables.appearanceIndex,
          variables.imageIndex,
        ),
      )

      return {
        previousQueries,
        previousUnifiedQueries,
        targetKey,
        requestId,
      }
    },
    onError: (_error, _variables, context) => {
      if (!context) return
      const latestRequestId = latestRequestIdByTargetRef.current[context.targetKey]
      if (latestRequestId !== context.requestId) return
      restoreCharacterQuerySnapshots(queryClient, context.previousQueries)
      restoreUnifiedQuerySnapshots(queryClient, context.previousUnifiedQueries)
    },
    onSettled: async (_data, _error, variables) => {
      if (variables.confirm) {
        await invalidateCharacters()
      }
    },
  })
}

export function useUndoCharacterImage() {
  const queryClient = useQueryClient()
  const invalidateCharacters = () => invalidateGlobalCharacters(queryClient)

  return useMutation({
    mutationFn: async ({ characterId, appearanceIndex }: { characterId: string; appearanceIndex: number }) => {
      return await requestJsonWithError(`/api/assets/${characterId}/revert-render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'global',
          kind: 'character',
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
      await queryClient.cancelQueries({
        queryKey: queryKeys.assets.all('global'),
        exact: false,
      })
      const previousQueries = captureCharacterQuerySnapshots(queryClient)
      const previousUnifiedQueries = captureUnifiedQuerySnapshots(queryClient)

      queryClient.setQueriesData<GlobalCharacter[] | undefined>(
        {
          queryKey: queryKeys.globalAssets.characters(),
          exact: false,
        },
        (previous) => previous?.filter((character) => character.id !== characterId),
      )

      queryClient.setQueriesData<AssetSummary[] | undefined>(
        {
          queryKey: queryKeys.assets.all('global'),
          exact: false,
        },
        (previous) => previous?.filter((asset) => asset.id !== characterId),
      )

      return { previousQueries, previousUnifiedQueries }
    },
    onError: (_error, _characterId, context) => {
      if (!context) return
      restoreCharacterQuerySnapshots(queryClient, context.previousQueries)
      restoreUnifiedQuerySnapshots(queryClient, context.previousUnifiedQueries)
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
