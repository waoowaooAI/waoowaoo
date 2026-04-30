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
import type { LocationAvailableSlot } from '@/lib/location-available-slots'

export function useUpdateCharacterName() {
  const queryClient = useQueryClient()
  const invalidateCharacters = () => invalidateGlobalCharacters(queryClient)

  return useMutation({
    mutationFn: async ({ characterId, name }: { characterId: string; name: string }) => {
      return await requestJsonWithError(`/api/assets/${characterId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'global',
          kind: 'character',
          name,
        }),
      }, 'Failed to update character name')
    },
    onSuccess: invalidateCharacters,
  })
}

export function useUpdateLocationName() {
  const queryClient = useQueryClient()
  const invalidateLocations = () => invalidateGlobalLocations(queryClient)

  return useMutation({
    mutationFn: async ({ locationId, name }: { locationId: string; name: string }) => {
      return await requestJsonWithError(`/api/assets/${locationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'global',
          kind: 'location',
          name,
        }),
      }, 'Failed to update location name')
    },
    onSuccess: invalidateLocations,
  })
}

export function useUpdateCharacterAppearanceDescription() {
  const queryClient = useQueryClient()
  const invalidateCharacters = () => invalidateGlobalCharacters(queryClient)

  return useMutation({
    mutationFn: async ({
      characterId,
      appearanceIndex,
      description,
    }: {
      characterId: string
      appearanceIndex: number
      description: string
    }) => {
      const assetQuery = new URLSearchParams({
        scope: 'global',
        kind: 'character',
      })
      const assets = await requestJsonWithError<{ assets?: Array<{ id: string; variants?: Array<{ index: number; id: string }> }> }>(
        `/api/assets?${assetQuery.toString()}`,
        { method: 'GET' },
        'Failed to resolve appearance variant',
      )
      const asset = (assets.assets ?? []).find((item) => item.id === characterId)
      const variantId = asset?.variants?.find((variant) => variant.index === appearanceIndex)?.id
      if (!variantId) {
        throw new Error('Failed to resolve appearance variant')
      }
      return await requestJsonWithError(`/api/assets/${characterId}/variants/${variantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'global',
          kind: 'character',
          description,
        }),
      }, 'Failed to update appearance description')
    },
    onSuccess: invalidateCharacters,
  })
}

export function useUpdateLocationSummary() {
  const queryClient = useQueryClient()
  const invalidateLocations = () => invalidateGlobalLocations(queryClient)

  return useMutation({
    mutationFn: async ({
      locationId,
      summary,
      availableSlots,
    }: {
      locationId: string
      summary: string
      availableSlots?: LocationAvailableSlot[]
    }) => {
      return await requestJsonWithError(`/api/assets/${locationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'global',
          kind: 'location',
          summary,
          ...(availableSlots ? { availableSlots } : {}),
        }),
      }, 'Failed to update location summary')
    },
    onSuccess: invalidateLocations,
  })
}

export function useAiModifyCharacterDescription() {
  const queryClient = useQueryClient()
  const invalidateCharacters = () => invalidateGlobalCharacters(queryClient)

  return useMutation({
    mutationFn: async ({
      characterId,
      appearanceIndex,
      currentDescription,
      modifyInstruction,
    }: {
      characterId: string
      appearanceIndex: number
      currentDescription: string
      modifyInstruction: string
    }) => {
      const response = await requestTaskResponseWithError(
        '/api/asset-hub/ai-modify-character',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            characterId,
            appearanceIndex,
            currentDescription,
            modifyInstruction,
          }),
        },
        'Failed to modify character description',
      )
      return resolveTaskResponse<{ modifiedDescription?: string; availableSlots?: LocationAvailableSlot[] }>(response)
    },
    onSettled: invalidateCharacters,
  })
}

export function useAiModifyLocationDescription() {
  const queryClient = useQueryClient()
  const invalidateLocations = () => invalidateGlobalLocations(queryClient)

  return useMutation({
    mutationFn: async ({
      locationId,
      imageIndex,
      currentDescription,
      modifyInstruction,
    }: {
      locationId: string
      imageIndex: number
      currentDescription: string
      modifyInstruction: string
    }) => {
      const response = await requestTaskResponseWithError(
        '/api/asset-hub/ai-modify-location',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            locationId,
            imageIndex,
            currentDescription,
            modifyInstruction,
          }),
        },
        'Failed to modify location description',
      )
      return resolveTaskResponse<{ modifiedDescription?: string; availableSlots?: LocationAvailableSlot[] }>(response)
    },
    onSettled: invalidateLocations,
  })
}

export function useAiModifyPropDescription() {
  return useMutation({
    mutationFn: async ({
      propId,
      variantId,
      currentDescription,
      modifyInstruction,
    }: {
      propId: string
      variantId?: string
      currentDescription: string
      modifyInstruction: string
    }) => {
      const response = await requestTaskResponseWithError(
        '/api/asset-hub/ai-modify-prop',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            propId,
            variantId,
            currentDescription,
            modifyInstruction,
          }),
        },
        'Failed to modify prop description',
      )
      return resolveTaskResponse<{ modifiedDescription?: string }>(response)
    },
  })
}
