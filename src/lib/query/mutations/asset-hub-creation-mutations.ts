import { useMutation, useQueryClient } from '@tanstack/react-query'
import { resolveTaskResponse } from '@/lib/task/client'
import {
  requestJsonWithError,
  requestTaskResponseWithError,
} from './mutation-shared'
import {
  invalidateGlobalCharacters,
  invalidateGlobalLocations,
} from './asset-hub-mutations-shared'

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
      return resolveTaskResponse<{ prompt?: string }>(response)
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
    mutationFn: async (payload: {
      name: string
      description: string
      folderId?: string | null
      artStyle?: string
      generateFromReference?: boolean
      referenceImageUrls?: string[]
      customDescription?: string
    }) =>
      await requestJsonWithError('/api/asset-hub/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, '创建角色失败'),
    onSuccess: invalidateCharacters,
  })
}
