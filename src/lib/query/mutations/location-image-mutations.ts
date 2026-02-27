import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import type { Location, Project } from '@/types/project'
import { queryKeys } from '../keys'
import type { ProjectAssetsData } from '../hooks/useProjectAssets'
import {
  clearTaskTargetOverlay,
  upsertTaskTargetOverlay,
} from '../task-target-overlay'
import {
  invalidateQueryTemplates,
  requestJsonWithError,
} from './mutation-shared'

interface SelectProjectLocationImageContext {
    previousAssets: ProjectAssetsData | undefined
    previousProject: Project | undefined
    targetKey: string
    requestId: number
}

function applyLocationSelectionToLocations(
    locations: Location[],
    locationId: string,
    selectedIndex: number | null,
): Location[] {
    return locations.map((location) => {
        if (location.id !== locationId) return location
        const selectedImageId =
            selectedIndex === null
                ? null
                : (location.images || []).find((image) => image.imageIndex === selectedIndex)?.id ?? null
        return {
            ...location,
            selectedImageId,
            images: (location.images || []).map((image) => ({
                ...image,
                isSelected: selectedIndex !== null && image.imageIndex === selectedIndex,
            })),
        }
    })
}

function applyLocationSelectionToAssets(
    previous: ProjectAssetsData | undefined,
    locationId: string,
    selectedIndex: number | null,
): ProjectAssetsData | undefined {
    if (!previous) return previous
    return {
        ...previous,
        locations: applyLocationSelectionToLocations(previous.locations || [], locationId, selectedIndex),
    }
}

function applyLocationSelectionToProject(
    previous: Project | undefined,
    locationId: string,
    selectedIndex: number | null,
): Project | undefined {
    if (!previous?.novelPromotionData) return previous
    const currentLocations = previous.novelPromotionData.locations || []
    return {
        ...previous,
        novelPromotionData: {
            ...previous.novelPromotionData,
            locations: applyLocationSelectionToLocations(currentLocations, locationId, selectedIndex),
        },
    }
}

export function useGenerateProjectLocationImage(projectId: string) {
    const queryClient = useQueryClient()
    const invalidateProjectAssets = () =>
        invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])

    return useMutation({
        mutationFn: async ({ locationId, imageIndex }: { locationId: string; imageIndex?: number }) => {
            return await requestJsonWithError(`/api/novel-promotion/${projectId}/generate-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'location',
                    id: locationId,
                    imageIndex
                })
            }, 'Failed to generate image')
        },
        onMutate: ({ locationId }) => {
            upsertTaskTargetOverlay(queryClient, {
                projectId,
                targetType: 'LocationImage',
                targetId: locationId,
                intent: 'generate',
            })
        },
        onError: (_error, { locationId }) => {
            clearTaskTargetOverlay(queryClient, {
                projectId,
                targetType: 'LocationImage',
                targetId: locationId,
            })
        },
        onSettled: invalidateProjectAssets,
    })
}

/**
 * 上传项目场景图片
 */

export function useUploadProjectLocationImage(projectId: string) {
    const queryClient = useQueryClient()
    const invalidateProjectAssets = () =>
        invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])

    return useMutation({
        mutationFn: async ({
            file, locationId, imageIndex, labelText
        }: {
            file: File
            locationId: string
            imageIndex?: number
            labelText?: string
        }) => {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('type', 'location')
            formData.append('id', locationId)
            if (imageIndex !== undefined) formData.append('imageIndex', imageIndex.toString())
            if (labelText) formData.append('labelText', labelText)

            return await requestJsonWithError(`/api/novel-promotion/${projectId}/upload-asset-image`, {
                method: 'POST',
                body: formData
            }, 'Failed to upload image')
        },
        onSuccess: invalidateProjectAssets,
    })
}

/**
 * 修改项目角色图片
 */

export function useModifyProjectLocationImage(projectId: string) {
    const queryClient = useQueryClient()
    const invalidateProjectAssetAndProjectData = () =>
        invalidateQueryTemplates(queryClient, [
            queryKeys.projectAssets.all(projectId),
            queryKeys.projectData(projectId),
        ])

    return useMutation({
        mutationFn: async (params: {
            locationId: string
            imageIndex: number
            modifyPrompt: string
            extraImageUrls?: string[]
        }) => {
            return await requestJsonWithError(`/api/novel-promotion/${projectId}/modify-asset-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'location',
                    ...params,
                }),
            }, 'Failed to modify image')
        },
        onMutate: ({ locationId }) => {
            upsertTaskTargetOverlay(queryClient, {
                projectId,
                targetType: 'LocationImage',
                targetId: locationId,
                intent: 'modify',
            })
        },
        onError: (_error, { locationId }) => {
            clearTaskTargetOverlay(queryClient, {
                projectId,
                targetType: 'LocationImage',
                targetId: locationId,
            })
        },
        onSettled: invalidateProjectAssetAndProjectData,
    })
}

/**
 * 重新生成角色组图片
 */

export function useRegenerateLocationGroup(projectId: string) {
    const queryClient = useQueryClient()
    const invalidateProjectAssets = () =>
        invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])

    return useMutation({
        mutationFn: async ({ locationId }: { locationId: string }) => {
            return await requestJsonWithError(`/api/novel-promotion/${projectId}/regenerate-group`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'location',
                    id: locationId,
                })
            }, 'Failed to regenerate group')
        },
        onMutate: ({ locationId }) => {
            upsertTaskTargetOverlay(queryClient, {
                projectId,
                targetType: 'LocationImage',
                targetId: locationId,
                intent: 'regenerate',
            })
        },
        onError: (_error, { locationId }) => {
            clearTaskTargetOverlay(queryClient, {
                projectId,
                targetType: 'LocationImage',
                targetId: locationId,
            })
        },
        onSettled: invalidateProjectAssets,
    })
}

/**
 * 重新生成单张场景图片
 */

export function useRegenerateSingleLocationImage(projectId: string) {
    const queryClient = useQueryClient()
    const invalidateProjectAssets = () =>
        invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])

    return useMutation({
        mutationFn: async ({ locationId, imageIndex }: { locationId: string; imageIndex: number }) => {
            return await requestJsonWithError(`/api/novel-promotion/${projectId}/regenerate-single-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'location',
                    id: locationId,
                    imageIndex,
                })
            }, 'Failed to regenerate image')
        },
        onMutate: ({ locationId }) => {
            upsertTaskTargetOverlay(queryClient, {
                projectId,
                targetType: 'LocationImage',
                targetId: locationId,
                intent: 'regenerate',
            })
        },
        onError: (_error, { locationId }) => {
            clearTaskTargetOverlay(queryClient, {
                projectId,
                targetType: 'LocationImage',
                targetId: locationId,
            })
        },
        onSettled: invalidateProjectAssets,
    })
}

/**
 * 选择项目场景图片
 */

export function useSelectProjectLocationImage(projectId: string) {
    const queryClient = useQueryClient()
    const latestRequestIdByTargetRef = useRef<Record<string, number>>({})
    const invalidateProjectAssets = () =>
        invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])

    return useMutation({
        mutationFn: async ({
            locationId, imageIndex
        }: {
            locationId: string
            imageIndex: number | null
            confirm?: boolean
        }) => {
            return await requestJsonWithError(`/api/novel-promotion/${projectId}/select-location-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    locationId,
                    selectedIndex: imageIndex,
                })
            }, 'Failed to select image')
        },
        onMutate: async (variables): Promise<SelectProjectLocationImageContext> => {
            const targetKey = variables.locationId
            const requestId = (latestRequestIdByTargetRef.current[targetKey] ?? 0) + 1
            latestRequestIdByTargetRef.current[targetKey] = requestId

            const assetsQueryKey = queryKeys.projectAssets.all(projectId)
            const projectQueryKey = queryKeys.projectData(projectId)

            await queryClient.cancelQueries({ queryKey: assetsQueryKey })
            await queryClient.cancelQueries({ queryKey: projectQueryKey })

            const previousAssets = queryClient.getQueryData<ProjectAssetsData>(assetsQueryKey)
            const previousProject = queryClient.getQueryData<Project>(projectQueryKey)

            queryClient.setQueryData<ProjectAssetsData | undefined>(assetsQueryKey, (previous) =>
                applyLocationSelectionToAssets(previous, variables.locationId, variables.imageIndex),
            )
            queryClient.setQueryData<Project | undefined>(projectQueryKey, (previous) =>
                applyLocationSelectionToProject(previous, variables.locationId, variables.imageIndex),
            )

            return {
                previousAssets,
                previousProject,
                targetKey,
                requestId,
            }
        },
        onError: (_error, _variables, context) => {
            if (!context) return
            const latestRequestId = latestRequestIdByTargetRef.current[context.targetKey]
            if (latestRequestId !== context.requestId) return
            queryClient.setQueryData(queryKeys.projectAssets.all(projectId), context.previousAssets)
            queryClient.setQueryData(queryKeys.projectData(projectId), context.previousProject)
        },
        onSettled: (_data, _error, variables) => {
            if (variables.confirm) {
                void invalidateProjectAssets()
            }
        },
    })
}

/**
 * 撤回项目场景图片
 */

export function useUndoProjectLocationImage(projectId: string) {
    const queryClient = useQueryClient()
    const invalidateProjectAssets = () =>
        invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])

    return useMutation({
        mutationFn: async (locationId: string) => {
            return await requestJsonWithError(`/api/novel-promotion/${projectId}/undo-regenerate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'location',
                    id: locationId
                })
            }, 'Failed to undo image')
        },
        onSuccess: invalidateProjectAssets,
    })
}
