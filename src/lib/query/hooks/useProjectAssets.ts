'use client'
import { logInfo as _ulogInfo } from '@/lib/logging/core'

import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../keys'
import { useTaskTargetStateMap } from './useTaskTargetStateMap'
import type { Character, Location } from '@/types/project'

// ============ 类型定义 ============
export interface ProjectAssetsData {
    characters: Character[]
    locations: Location[]
}

const CHARACTER_TASK_TYPES = ['image_character', 'modify_asset_image', 'regenerate_group']
const LOCATION_TASK_TYPES = ['image_location', 'modify_asset_image', 'regenerate_group']

function isRunningPhase(phase: string | null | undefined) {
    return phase === 'queued' || phase === 'processing'
}

// ============ 查询 Hooks ============

/**
 * 获取项目资产（角色 + 场景）
 */
export function useProjectAssets(projectId: string | null) {
    const assetsQuery = useQuery({
        queryKey: queryKeys.projectAssets.all(projectId || ''),
        queryFn: async () => {
            if (!projectId) throw new Error('Project ID is required')
            const res = await fetch(`/api/novel-promotion/${projectId}/assets`)
            if (!res.ok) throw new Error('Failed to fetch project assets')
            const data = await res.json()
            return data as ProjectAssetsData
        },
        enabled: !!projectId,
        staleTime: 5000,
    })

    const taskTargets = useMemo(() => {
        const assets = assetsQuery.data
        if (!assets) return []

        const targets: Array<{ targetType: string; targetId: string; types: string[] }> = []

        for (const character of assets.characters || []) {
            targets.push({
                targetType: 'CharacterAppearance',
                targetId: character.id,
                types: CHARACTER_TASK_TYPES,
            })
            for (const appearance of character.appearances || []) {
                targets.push({
                    targetType: 'CharacterAppearance',
                    targetId: appearance.id,
                    types: CHARACTER_TASK_TYPES,
                })
            }
        }

        for (const location of assets.locations || []) {
            targets.push({
                targetType: 'LocationImage',
                targetId: location.id,
                types: LOCATION_TASK_TYPES,
            })
            for (const image of location.images || []) {
                targets.push({
                    targetType: 'LocationImage',
                    targetId: image.id,
                    types: LOCATION_TASK_TYPES,
                })
            }
        }

        return targets
    }, [assetsQuery.data])

    const taskStatesQuery = useTaskTargetStateMap(projectId, taskTargets, {
        enabled: !!projectId && taskTargets.length > 0,
    })

    const data = useMemo(() => {
        const assets = assetsQuery.data
        if (!assets) return assets
        const byKey = taskStatesQuery.byKey
        const getState = (targetType: string, targetId: string) =>
            byKey.get(`${targetType}:${targetId}`) || null

        return {
            ...assets,
            characters: (assets.characters || []).map((character) => {
                const characterState = getState('CharacterAppearance', character.id)
                return {
                    ...character,
                    appearances: (character.appearances || []).map((appearance) => {
                        const appearanceState = getState('CharacterAppearance', appearance.id)
                        const lastError = appearanceState?.lastError
                            || characterState?.lastError
                            || null
                        return {
                            ...appearance,
                            imageTaskRunning:
                                isRunningPhase(appearanceState?.phase) ||
                                isRunningPhase(characterState?.phase),
                            lastError,
                        }
                    }),
                }
            }),
            locations: (assets.locations || []).map((location) => {
                const locationState = getState('LocationImage', location.id)
                return {
                    ...location,
                    images: (location.images || []).map((image) => {
                        const imageState = getState('LocationImage', image.id)
                        const lastError = imageState?.lastError
                            || locationState?.lastError
                            || null
                        return {
                            ...image,
                            imageTaskRunning:
                                isRunningPhase(imageState?.phase) ||
                                isRunningPhase(locationState?.phase),
                            lastError,
                        }
                    }),
                }
            }),
        } as ProjectAssetsData
    }, [assetsQuery.data, taskStatesQuery.byKey])

    return {
        ...assetsQuery,
        data,
        isFetching: assetsQuery.isFetching || taskStatesQuery.isFetching,
    }
}

/**
 * 获取项目角色
 */
export function useProjectCharacters(projectId: string | null) {
    return useQuery({
        queryKey: queryKeys.projectAssets.characters(projectId || ''),
        queryFn: async () => {
            if (!projectId) throw new Error('Project ID is required')
            const res = await fetch(`/api/novel-promotion/${projectId}/characters`)
            if (!res.ok) throw new Error('Failed to fetch characters')
            const data = await res.json()
            return data.characters as Character[]
        },
        enabled: !!projectId,
    })
}

/**
 * 获取项目场景
 */
export function useProjectLocations(projectId: string | null) {
    return useQuery({
        queryKey: queryKeys.projectAssets.locations(projectId || ''),
        queryFn: async () => {
            if (!projectId) throw new Error('Project ID is required')
            const res = await fetch(`/api/novel-promotion/${projectId}/locations`)
            if (!res.ok) throw new Error('Failed to fetch locations')
            const data = await res.json()
            return data.locations as Location[]
        },
        enabled: !!projectId,
    })
}

/**
 * 刷新项目资产
 * 🔥 同时刷新 projectAssets 和 projectData 两个缓存
 *    - projectAssets: 用于直接订阅 useProjectAssets 的组件
 *    - projectData: 用于 NovelPromotionWorkspace（通过 useProjectData 获取 characters/locations）
 */
export function useRefreshProjectAssets(projectId: string | null) {
    const queryClient = useQueryClient()

    return () => {
        if (projectId) {
            _ulogInfo('[刷新资产] 同时刷新 projectAssets / projectData / tasks 缓存')
            queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
            queryClient.invalidateQueries({ queryKey: queryKeys.projectData(projectId) })
            queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all(projectId), exact: false })
        }
    }
}
