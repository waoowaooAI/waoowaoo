import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import {
  clearTaskTargetOverlay,
  upsertTaskTargetOverlay,
} from '../task-target-overlay'
import { queryKeys } from '../keys'
import type { GlobalLocation } from '../hooks/useGlobalAssets'
import {
  requestJsonWithError,
  requestVoidWithError,
} from './mutation-shared'
import {
  GLOBAL_ASSET_PROJECT_ID,
  invalidateGlobalLocations,
} from './asset-hub-mutations-shared'

interface SelectLocationImageContext {
  previousQueries: Array<{
    queryKey: readonly unknown[]
    data: GlobalLocation[] | undefined
  }>
  targetKey: string
  requestId: number
}

interface DeleteLocationContext {
  previousQueries: Array<{
    queryKey: readonly unknown[]
    data: GlobalLocation[] | undefined
  }>
}

function applyLocationSelection(
  locations: GlobalLocation[] | undefined,
  locationId: string,
  imageIndex: number | null,
): GlobalLocation[] | undefined {
  if (!locations) return locations
  return locations.map((location) => {
    if (location.id !== locationId) return location
    return {
      ...location,
      images: (location.images || []).map((image) => ({
        ...image,
        isSelected: imageIndex !== null && image.imageIndex === imageIndex,
      })),
    }
  })
}

function captureLocationQuerySnapshots(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient
    .getQueriesData<GlobalLocation[]>({
      queryKey: queryKeys.globalAssets.locations(),
      exact: false,
    })
    .map(([queryKey, data]) => ({ queryKey, data }))
}

function restoreLocationQuerySnapshots(
  queryClient: ReturnType<typeof useQueryClient>,
  snapshots: Array<{ queryKey: readonly unknown[]; data: GlobalLocation[] | undefined }>,
) {
  snapshots.forEach((snapshot) => {
    queryClient.setQueryData(snapshot.queryKey, snapshot.data)
  })
}

export function useGenerateLocationImage() {
  const queryClient = useQueryClient()
  const invalidateLocations = () => invalidateGlobalLocations(queryClient)

  return useMutation({
    mutationFn: async (locationId: string) => {
      return await requestJsonWithError('/api/asset-hub/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'location', id: locationId }),
      }, 'Failed to generate image')
    },
    onMutate: (locationId) => {
      upsertTaskTargetOverlay(queryClient, {
        projectId: GLOBAL_ASSET_PROJECT_ID,
        targetType: 'GlobalLocation',
        targetId: locationId,
        intent: 'generate',
      })
    },
    onError: (_error, locationId) => {
      clearTaskTargetOverlay(queryClient, {
        projectId: GLOBAL_ASSET_PROJECT_ID,
        targetType: 'GlobalLocation',
        targetId: locationId,
      })
    },
    onSettled: invalidateLocations,
  })
}

export function useModifyLocationImage() {
  const queryClient = useQueryClient()
  const invalidateLocations = () => invalidateGlobalLocations(queryClient)

  return useMutation({
    mutationFn: async ({
      locationId,
      imageIndex,
      modifyPrompt,
      extraImageUrls,
    }: {
      locationId: string
      imageIndex: number
      modifyPrompt: string
      extraImageUrls?: string[]
    }) => {
      return await requestJsonWithError('/api/asset-hub/modify-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'location',
          id: locationId,
          imageIndex,
          modifyPrompt,
          extraImageUrls,
        }),
      }, 'Failed to modify image')
    },
    onMutate: ({ locationId, imageIndex }) => {
      upsertTaskTargetOverlay(queryClient, {
        projectId: GLOBAL_ASSET_PROJECT_ID,
        targetType: 'GlobalLocationImage',
        targetId: `${locationId}:${imageIndex}`,
        intent: 'modify',
      })
    },
    onError: (_error, { locationId, imageIndex }) => {
      clearTaskTargetOverlay(queryClient, {
        projectId: GLOBAL_ASSET_PROJECT_ID,
        targetType: 'GlobalLocationImage',
        targetId: `${locationId}:${imageIndex}`,
      })
    },
    onSettled: invalidateLocations,
  })
}

export function useSelectLocationImage() {
  const queryClient = useQueryClient()
  const latestRequestIdByTargetRef = useRef<Record<string, number>>({})
  const invalidateLocations = () => invalidateGlobalLocations(queryClient)

  return useMutation({
    mutationFn: async ({
      locationId,
      imageIndex,
      confirm = false,
    }: {
      locationId: string
      imageIndex: number | null
      confirm?: boolean
    }) => {
      return await requestJsonWithError('/api/asset-hub/select-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'location',
          id: locationId,
          imageIndex,
          confirm,
        }),
      }, 'Failed to select image')
    },
    onMutate: async (variables): Promise<SelectLocationImageContext> => {
      const targetKey = variables.locationId
      const requestId = (latestRequestIdByTargetRef.current[targetKey] ?? 0) + 1
      latestRequestIdByTargetRef.current[targetKey] = requestId

      await queryClient.cancelQueries({
        queryKey: queryKeys.globalAssets.locations(),
        exact: false,
      })
      const previousQueries = captureLocationQuerySnapshots(queryClient)

      queryClient.setQueriesData<GlobalLocation[] | undefined>(
        {
          queryKey: queryKeys.globalAssets.locations(),
          exact: false,
        },
        (previous) => applyLocationSelection(previous, variables.locationId, variables.imageIndex),
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
      restoreLocationQuerySnapshots(queryClient, context.previousQueries)
    },
    onSettled: (_data, _error, variables) => {
      if (variables.confirm) {
        void invalidateLocations()
      }
    },
  })
}

export function useUndoLocationImage() {
  const queryClient = useQueryClient()
  const invalidateLocations = () => invalidateGlobalLocations(queryClient)

  return useMutation({
    mutationFn: async (locationId: string) => {
      return await requestJsonWithError('/api/asset-hub/undo-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'location', id: locationId }),
      }, 'Failed to undo image')
    },
    onSuccess: invalidateLocations,
  })
}

export function useUploadLocationImage() {
  const queryClient = useQueryClient()
  const invalidateLocations = () => invalidateGlobalLocations(queryClient)

  return useMutation({
    mutationFn: async ({
      file,
      locationId,
      labelText,
      imageIndex,
    }: {
      file: File
      locationId: string
      labelText: string
      imageIndex?: number
    }) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', 'location')
      formData.append('id', locationId)
      formData.append('labelText', labelText)
      if (imageIndex !== undefined) {
        formData.append('imageIndex', imageIndex.toString())
      }

      return await requestJsonWithError('/api/asset-hub/upload-image', {
        method: 'POST',
        body: formData,
      }, 'Failed to upload image')
    },
    onSuccess: invalidateLocations,
  })
}

export function useDeleteLocation() {
  const queryClient = useQueryClient()
  const invalidateLocations = () => invalidateGlobalLocations(queryClient)

  return useMutation({
    mutationFn: async (locationId: string) => {
      await requestVoidWithError(
        `/api/asset-hub/locations/${locationId}`,
        { method: 'DELETE' },
        'Failed to delete location',
      )
    },
    onMutate: async (locationId): Promise<DeleteLocationContext> => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.globalAssets.locations(),
        exact: false,
      })
      const previousQueries = captureLocationQuerySnapshots(queryClient)

      queryClient.setQueriesData<GlobalLocation[] | undefined>(
        {
          queryKey: queryKeys.globalAssets.locations(),
          exact: false,
        },
        (previous) => previous?.filter((location) => location.id !== locationId),
      )

      return { previousQueries }
    },
    onError: (_error, _locationId, context) => {
      if (!context) return
      restoreLocationQuerySnapshots(queryClient, context.previousQueries)
    },
    onSettled: invalidateLocations,
  })
}
