'use client'

import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../keys'
import { useTaskTargetStateMap } from './useTaskTargetStateMap'
import { resolveTaskErrorMessage } from '@/lib/task/error-message'
import type { MediaRef } from '@/types/project'

// ============ 类型定义 ============
export interface GlobalCharacterAppearance {
    id: string
    appearanceIndex: number
    changeReason: string
    description: string | null
    descriptionSource: string | null
    imageUrl: string | null
    media?: MediaRef | null
    imageUrls: string[]
    imageMedias?: MediaRef[]
    selectedIndex: number | null
    previousImageUrl: string | null
    previousMedia?: MediaRef | null
    previousImageUrls: string[]
    previousImageMedias?: MediaRef[]
    imageTaskRunning: boolean
    lastError?: { code: string; message: string } | null
}

export interface GlobalCharacter {
    id: string
    name: string
    folderId: string | null
    customVoiceUrl: string | null
    media?: MediaRef | null
    appearances: GlobalCharacterAppearance[]
}

export interface GlobalLocationImage {
    id: string
    imageIndex: number
    description: string | null
    imageUrl: string | null
    media?: MediaRef | null
    previousImageUrl: string | null
    previousMedia?: MediaRef | null
    isSelected: boolean
    imageTaskRunning: boolean
    lastError?: { code: string; message: string } | null
}

export interface GlobalLocation {
    id: string
    name: string
    summary: string | null
    folderId: string | null
    images: GlobalLocationImage[]
}

export interface GlobalVoice {
    id: string
    name: string
    description: string | null
    voiceId: string | null
    voiceType: string
    customVoiceUrl: string | null
    media?: MediaRef | null
    voicePrompt: string | null
    gender: string | null
    language: string
    folderId: string | null
}

export interface GlobalFolder {
    id: string
    name: string
}

const GLOBAL_ASSET_PROJECT_ID = 'global-asset-hub'
const GLOBAL_IMAGE_TASK_TYPES = ['asset_hub_image']
const GLOBAL_MODIFY_TASK_TYPES = ['asset_hub_modify']

function isRunningPhase(phase: string | null | undefined) {
    return phase === 'queued' || phase === 'processing'
}

// ============ 查询 Hooks ============

/**
 * 获取中心资产库角色列表
 */
export function useGlobalCharacters(folderId?: string | null) {
    const charactersQuery = useQuery({
        queryKey: queryKeys.globalAssets.characters(folderId),
        queryFn: async () => {
            const params = new URLSearchParams()
            if (folderId) params.set('folderId', folderId)
            const res = await fetch(`/api/asset-hub/characters?${params}`)
            if (!res.ok) throw new Error('Failed to fetch characters')
            const data = await res.json()
            return data.characters as GlobalCharacter[]
        },
    })
    const taskTargets = useMemo(() => {
        const characters = charactersQuery.data || []
        const targets: Array<{ targetType: string; targetId: string; types: string[] }> = []
        for (const character of characters) {
            targets.push({
                targetType: 'GlobalCharacter',
                targetId: character.id,
                types: GLOBAL_IMAGE_TASK_TYPES,
            })
            for (const appearance of character.appearances || []) {
                targets.push({
                    targetType: 'GlobalCharacterAppearance',
                    targetId: appearance.id,
                    types: GLOBAL_MODIFY_TASK_TYPES,
                })
                const imageCount = Math.max(3, appearance.imageUrls?.length || 0)
                for (let index = 0; index < imageCount; index += 1) {
                    targets.push({
                        targetType: 'GlobalCharacterAppearance',
                        targetId: `${character.id}:${appearance.appearanceIndex}:${index}`,
                        types: GLOBAL_MODIFY_TASK_TYPES,
                    })
                }
            }
        }
        return targets
    }, [charactersQuery.data])

    const taskStatesQuery = useTaskTargetStateMap(GLOBAL_ASSET_PROJECT_ID, taskTargets, {
        enabled: taskTargets.length > 0,
    })

    const data = useMemo(() => {
        const characters = charactersQuery.data
        if (!characters) return characters
        const byKey = taskStatesQuery.byKey
        const getState = (targetType: string, targetId: string) =>
            byKey.get(`${targetType}:${targetId}`) || null
        return characters.map((character) => ({
            ...character,
            appearances: (character.appearances || []).map((appearance) => {
                const imageCount = Math.max(3, appearance.imageUrls?.length || 0)
                let hasAppearanceTask = isRunningPhase(
                    getState('GlobalCharacterAppearance', appearance.id)?.phase,
                )
                let appearanceError: { code: string; message: string } | null = null
                for (let index = 0; index < imageCount; index += 1) {
                    const indexState = getState(
                        'GlobalCharacterAppearance',
                        `${character.id}:${appearance.appearanceIndex}:${index}`,
                    )
                    if (!hasAppearanceTask && isRunningPhase(indexState?.phase)) {
                        hasAppearanceTask = true
                    }
                    if (!appearanceError && indexState?.lastError) {
                        appearanceError = indexState.lastError
                    }
                }
                const characterState = getState('GlobalCharacter', character.id)
                const hasCharacterTask = isRunningPhase(characterState?.phase)
                // 优先取子索引级的错误，其次取 appearance 级，最后取 character 级
                const lastError = appearanceError
                    || getState('GlobalCharacterAppearance', appearance.id)?.lastError
                    || characterState?.lastError
                    || null
                return {
                    ...appearance,
                    imageTaskRunning: hasCharacterTask || hasAppearanceTask,
                    lastError,
                }
            }),
        }))
    }, [charactersQuery.data, taskStatesQuery.byKey])

    return {
        ...charactersQuery,
        data,
        isFetching: charactersQuery.isFetching || taskStatesQuery.isFetching,
    }
}

/**
 * 获取中心资产库场景列表
 */
export function useGlobalLocations(folderId?: string | null) {
    const locationsQuery = useQuery({
        queryKey: queryKeys.globalAssets.locations(folderId),
        queryFn: async () => {
            const params = new URLSearchParams()
            if (folderId) params.set('folderId', folderId)
            const res = await fetch(`/api/asset-hub/locations?${params}`)
            if (!res.ok) throw new Error('Failed to fetch locations')
            const data = await res.json()
            return data.locations as GlobalLocation[]
        },
    })
    const taskTargets = useMemo(() => {
        const locations = locationsQuery.data || []
        const targets: Array<{ targetType: string; targetId: string; types: string[] }> = []
        for (const location of locations) {
            targets.push({
                targetType: 'GlobalLocation',
                targetId: location.id,
                types: GLOBAL_IMAGE_TASK_TYPES,
            })
            for (const image of location.images || []) {
                targets.push({
                    targetType: 'GlobalLocationImage',
                    targetId: image.id,
                    types: GLOBAL_MODIFY_TASK_TYPES,
                })
                targets.push({
                    targetType: 'GlobalLocationImage',
                    targetId: `${location.id}:${image.imageIndex}`,
                    types: GLOBAL_MODIFY_TASK_TYPES,
                })
            }
        }
        return targets
    }, [locationsQuery.data])

    const taskStatesQuery = useTaskTargetStateMap(GLOBAL_ASSET_PROJECT_ID, taskTargets, {
        enabled: taskTargets.length > 0,
    })

    const data = useMemo(() => {
        const locations = locationsQuery.data
        if (!locations) return locations
        const byKey = taskStatesQuery.byKey
        const getState = (targetType: string, targetId: string) =>
            byKey.get(`${targetType}:${targetId}`) || null
        return locations.map((location) => ({
            ...location,
            images: (location.images || []).map((image) => {
                const locationState = getState('GlobalLocation', location.id)
                const imageState = getState('GlobalLocationImage', image.id)
                const indexState = getState('GlobalLocationImage', `${location.id}:${image.imageIndex}`)
                const hasLocationTask = isRunningPhase(locationState?.phase)
                const hasImageTask =
                    isRunningPhase(imageState?.phase) ||
                    isRunningPhase(indexState?.phase)
                const lastError = indexState?.lastError
                    || imageState?.lastError
                    || locationState?.lastError
                    || null
                return {
                    ...image,
                    imageTaskRunning: hasLocationTask || hasImageTask,
                    lastError,
                }
            }),
        }))
    }, [locationsQuery.data, taskStatesQuery.byKey])

    return {
        ...locationsQuery,
        data,
        isFetching: locationsQuery.isFetching || taskStatesQuery.isFetching,
    }
}

/**
 * 获取中心资产库音色列表
 */
export function useGlobalVoices(folderId?: string | null) {
    return useQuery({
        queryKey: queryKeys.globalAssets.voices(folderId),
        queryFn: async () => {
            const params = new URLSearchParams()
            if (folderId) params.set('folderId', folderId)
            const res = await fetch(`/api/asset-hub/voices?${params}`)
            if (!res.ok) throw new Error('Failed to fetch voices')
            const data = await res.json()
            return data.voices as GlobalVoice[]
        },
    })
}

/**
 * 获取中心资产库文件夹列表
 */
export function useGlobalFolders() {
    return useQuery({
        queryKey: queryKeys.globalAssets.folders(),
        queryFn: async () => {
            const res = await fetch('/api/asset-hub/folders')
            if (!res.ok) throw new Error('Failed to fetch folders')
            const data = await res.json()
            return data.folders as GlobalFolder[]
        },
    })
}

// ============ 文件夹 Mutation Hooks ============

/**
 * 创建文件夹
 */
export function useCreateFolder() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ name }: { name: string }) => {
            const res = await fetch('/api/asset-hub/folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(resolveTaskErrorMessage(error, 'Failed to create folder'))
            }
            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.folders() })
        },
    })
}

/**
 * 更新文件夹
 */
export function useUpdateFolder() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ folderId, name }: { folderId: string; name: string }) => {
            const res = await fetch('/api/asset-hub/folders', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderId, name }),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(resolveTaskErrorMessage(error, 'Failed to update folder'))
            }
            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.folders() })
        },
    })
}

/**
 * 删除文件夹
 */
export function useDeleteFolder() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ folderId }: { folderId: string }) => {
            const res = await fetch(`/api/asset-hub/folders?folderId=${folderId}`, {
                method: 'DELETE',
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(resolveTaskErrorMessage(error, 'Failed to delete folder'))
            }
            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.folders() })
            queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.all() })
        },
    })
}

/**
 * 刷新所有中心资产库数据
 */
export function useRefreshGlobalAssets() {
    const queryClient = useQueryClient()

    return () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.all() })
    }
}
