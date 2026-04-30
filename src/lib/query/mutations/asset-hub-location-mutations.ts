import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import {
  clearTaskTargetOverlay,
  upsertTaskTargetOverlay,
} from '../task-target-overlay'
import { queryKeys } from '../keys'
import type { GlobalLocation } from '../hooks/useGlobalAssets'
import type { AssetSummary } from '@/lib/assets/contracts'
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
  previousUnifiedQueries: Array<{
    queryKey: readonly unknown[]
    data: AssetSummary[] | undefined
  }>
  targetKey: string
  requestId: number
}

interface DeleteLocationContext {
  previousQueries: Array<{
    queryKey: readonly unknown[]
    data: GlobalLocation[] | undefined
  }>
  previousUnifiedQueries: Array<{
    queryKey: readonly unknown[]
    data: AssetSummary[] | undefined
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

function captureUnifiedQuerySnapshots(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient
    .getQueriesData<AssetSummary[]>({
      queryKey: queryKeys.assets.all('global'),
      exact: false,
    })
    .map(([queryKey, data]) => ({ queryKey, data }))
}

function applyUnifiedLocationSelection(
  assets: AssetSummary[] | undefined,
  locationId: string,
  imageIndex: number | null,
): AssetSummary[] | undefined {
  if (!assets) return assets
  return assets.map((asset) => {
    if (asset.id !== locationId || asset.kind !== 'location') return asset
    return {
      ...asset,
      selectedVariantId: imageIndex === null
        ? null
        : asset.variants.find((variant) => variant.index === imageIndex)?.id ?? asset.selectedVariantId,
      variants: asset.variants.map((variant) => {
        const isSelectedVariant = imageIndex !== null && variant.index === imageIndex
        return {
          ...variant,
          selectionState: {
            ...variant.selectionState,
            selectedRenderIndex: isSelectedVariant ? 0 : null,
          },
          renders: variant.renders.map((render) => ({
            ...render,
            isSelected: isSelectedVariant && render.index === 0,
          })),
        }
      }),
    }
  })
}

function restoreLocationQuerySnapshots(
  queryClient: ReturnType<typeof useQueryClient>,
  snapshots: Array<{ queryKey: readonly unknown[]; data: GlobalLocation[] | undefined }>,
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

export function useGenerateLocationImage() {
  const queryClient = useQueryClient()
  const invalidateLocations = () => invalidateGlobalLocations(queryClient)

  return useMutation({
    mutationFn: async ({
      locationId,
      artStyle,
      count,
    }: {
      locationId: string
      artStyle?: string
      count?: number
    }) => {
      return await requestJsonWithError(`/api/assets/${locationId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'global',
          kind: 'location',
          artStyle,
          count,
        }),
      }, 'Failed to generate image')
    },
    onMutate: ({ locationId }) => {
      upsertTaskTargetOverlay(queryClient, {
        projectId: GLOBAL_ASSET_PROJECT_ID,
        targetType: 'GlobalLocation',
        targetId: locationId,
        intent: 'generate',
      })
    },
    onError: (_error, { locationId }) => {
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
      return await requestJsonWithError(`/api/assets/${locationId}/modify-render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'global',
          kind: 'location',
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
      return await requestJsonWithError(`/api/assets/${locationId}/select-render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'global',
          kind: 'location',
          imageIndex,
          confirm,
        }),
      }, 'Failed to select image')
    },
    onMutate: async (variables): Promise<SelectLocationImageContext> => {
      const targetKey = variables.locationId
      const requestId = (latestRequestIdByTargetRef.current[targetKey] ?? 0) + 1
      latestRequestIdByTargetRef.current[targetKey] = requestId

      if (variables.confirm) {
        return { previousQueries: [], previousUnifiedQueries: [], targetKey, requestId }
      }

      await queryClient.cancelQueries({
        queryKey: queryKeys.globalAssets.locations(),
        exact: false,
      })
      await queryClient.cancelQueries({
        queryKey: queryKeys.assets.all('global'),
        exact: false,
      })
      const previousQueries = captureLocationQuerySnapshots(queryClient)
      const previousUnifiedQueries = captureUnifiedQuerySnapshots(queryClient)

      queryClient.setQueriesData<GlobalLocation[] | undefined>(
        {
          queryKey: queryKeys.globalAssets.locations(),
          exact: false,
        },
        (previous) => applyLocationSelection(previous, variables.locationId, variables.imageIndex),
      )

      queryClient.setQueriesData<AssetSummary[] | undefined>(
        {
          queryKey: queryKeys.assets.all('global'),
          exact: false,
        },
        (previous) => applyUnifiedLocationSelection(previous, variables.locationId, variables.imageIndex),
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
      restoreLocationQuerySnapshots(queryClient, context.previousQueries)
      restoreUnifiedQuerySnapshots(queryClient, context.previousUnifiedQueries)
    },
    onSettled: async (_data, _error, variables) => {
      if (variables.confirm) {
        await invalidateLocations()
      }
    },
  })
}

export function useUndoLocationImage() {
  const queryClient = useQueryClient()
  const invalidateLocations = () => invalidateGlobalLocations(queryClient)

  return useMutation({
    mutationFn: async (locationId: string) => {
      return await requestJsonWithError(`/api/assets/${locationId}/revert-render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'global',
          kind: 'location',
        }),
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
      await queryClient.cancelQueries({
        queryKey: queryKeys.assets.all('global'),
        exact: false,
      })
      const previousQueries = captureLocationQuerySnapshots(queryClient)
      const previousUnifiedQueries = captureUnifiedQuerySnapshots(queryClient)

      queryClient.setQueriesData<GlobalLocation[] | undefined>(
        {
          queryKey: queryKeys.globalAssets.locations(),
          exact: false,
        },
        (previous) => previous?.filter((location) => location.id !== locationId),
      )

      queryClient.setQueriesData<AssetSummary[] | undefined>(
        {
          queryKey: queryKeys.assets.all('global'),
          exact: false,
        },
        (previous) => previous?.filter((asset) => asset.id !== locationId),
      )

      return { previousQueries, previousUnifiedQueries }
    },
    onError: (_error, _locationId, context) => {
      if (!context) return
      restoreLocationQuerySnapshots(queryClient, context.previousQueries)
      restoreUnifiedQuerySnapshots(queryClient, context.previousUnifiedQueries)
    },
    onSettled: invalidateLocations,
  })
}
