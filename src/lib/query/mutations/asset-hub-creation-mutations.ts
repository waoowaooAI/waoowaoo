import { useMutation, useQueryClient } from '@tanstack/react-query'
import { resolveTaskResponse } from '@/lib/task/client'
import { mapGlobalCharacterToAsset } from '@/lib/assets/mappers'
import type { AssetSummary } from '@/lib/assets/contracts'
import type { GlobalCharacter } from '@/lib/query/hooks/useGlobalAssets'
import { queryKeys } from '@/lib/query/keys'
import { upsertTaskTargetOverlay } from '@/lib/query/task-target-overlay'
import {
  requestJsonWithError,
  requestTaskResponseWithError,
} from './mutation-shared'
import {
  GLOBAL_ASSET_PROJECT_ID,
  invalidateGlobalCharacters,
  invalidateGlobalLocations,
} from './asset-hub-mutations-shared'
import type { LocationAvailableSlot } from '@/lib/location-available-slots'

type CreateAssetHubCharacterResponse = {
  character?: GlobalCharacter
}

type CreateAssetHubCharacterVariables = {
  name: string
  description: string
  folderId?: string | null
  artStyle: string
  generateFromReference?: boolean
  referenceImageUrls?: string[]
  customDescription?: string
  count?: number
}

function queryFolderFilter(queryKey: readonly unknown[], index: number): string | null {
  const value = queryKey[index]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function upsertCharacter<T extends { id: string; folderId?: string | null }>(
  items: T[] | undefined,
  character: T,
  folderFilter: string | null,
) {
  if (!items) return items
  if (folderFilter && character.folderId !== folderFilter) return items
  const existingIndex = items.findIndex((item) => item.id === character.id)
  if (existingIndex >= 0) {
    return items.map((item, index) => index === existingIndex ? character : item)
  }
  return [character, ...items]
}

function upsertCreatedCharacterCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  character: GlobalCharacter,
) {
  queryClient
    .getQueriesData<GlobalCharacter[]>({
      queryKey: queryKeys.globalAssets.characters(),
      exact: false,
    })
    .forEach(([queryKey, data]) => {
      const folderFilter = queryFolderFilter(queryKey, 2)
      queryClient.setQueryData(queryKey, upsertCharacter(data, character, folderFilter))
    })

  const unifiedCharacter = mapGlobalCharacterToAsset(character)
  queryClient
    .getQueriesData<AssetSummary[]>({
      queryKey: queryKeys.assets.all('global'),
      exact: false,
    })
    .forEach(([queryKey, data]) => {
      const folderFilter = queryFolderFilter(queryKey, 2)
      const kindFilter = queryFolderFilter(queryKey, 3)
      if (kindFilter && kindFilter !== 'character') return
      queryClient.setQueryData(queryKey, upsertCharacter(data, unifiedCharacter, folderFilter))
    })
}

export function useAiDesignLocation() {
  return useMutation({
    mutationFn: async (userInstruction: string) => {
      const response = await requestTaskResponseWithError(
        '/api/asset-hub/ai-design-location',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userInstruction }),
        },
        'Failed to design location',
      )
      return resolveTaskResponse<{ prompt?: string; availableSlots?: LocationAvailableSlot[] }>(response)
    },
  })
}

export function useCreateAssetHubLocation() {
  const queryClient = useQueryClient()
  const invalidateLocations = () => invalidateGlobalLocations(queryClient)

  return useMutation({
    mutationFn: async (payload: {
      name: string
      summary: string
      folderId: string | null
      artStyle: string
      count?: number
      availableSlots?: LocationAvailableSlot[]
    }) => {
      return await requestJsonWithError('/api/asset-hub/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, '创建失败')
    },
    onSuccess: invalidateLocations,
  })
}

export function useUploadAssetHubTempMedia() {
  return useMutation({
    mutationFn: async (payload: { imageBase64?: string; base64?: string; extension?: string; type?: string }) =>
      await requestJsonWithError<{ success: boolean; url?: string; key?: string }>(
        '/api/asset-hub/upload-temp',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        '上传失败',
      ),
  })
}

export function useAiDesignCharacter() {
  return useMutation({
    mutationFn: async (userInstruction: string) => {
      const response = await requestTaskResponseWithError(
        '/api/asset-hub/ai-design-character',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userInstruction }),
        },
        'Failed to design character',
      )
      return resolveTaskResponse<{ prompt?: string }>(response)
    },
  })
}

export function useExtractAssetHubReferenceCharacterDescription() {
  return useMutation({
    mutationFn: async (referenceImageUrls: string[]) => {
      const response = await requestTaskResponseWithError(
        '/api/asset-hub/reference-to-character',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            referenceImageUrls,
            extractOnly: true,
          }),
        },
        'Failed to extract character description',
      )
      return resolveTaskResponse<{ description?: string }>(response)
    },
  })
}

export function useCreateAssetHubCharacter() {
  const queryClient = useQueryClient()
  const invalidateCharacters = () => invalidateGlobalCharacters(queryClient)

  return useMutation({
    mutationFn: async (payload: CreateAssetHubCharacterVariables) =>
      await requestJsonWithError<CreateAssetHubCharacterResponse>('/api/asset-hub/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, '创建角色失败'),
    onSuccess: (data: CreateAssetHubCharacterResponse, variables: CreateAssetHubCharacterVariables) => {
      if (data.character) {
        upsertCreatedCharacterCaches(queryClient, data.character)
        const primaryAppearanceId = data.character.appearances?.[0]?.id
        if (variables.generateFromReference && primaryAppearanceId) {
          upsertTaskTargetOverlay(queryClient, {
            projectId: GLOBAL_ASSET_PROJECT_ID,
            targetType: 'GlobalCharacterAppearance',
            targetId: primaryAppearanceId,
            runningTaskType: 'asset_hub_reference_to_character',
            intent: 'generate',
          })
        }
      }
      invalidateCharacters()
    },
  })
}
