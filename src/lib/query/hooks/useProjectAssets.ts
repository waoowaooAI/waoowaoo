'use client'
import { logInfo as _ulogInfo } from '@/lib/logging/core'

import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../keys'
import type { Character, Location, MediaRef, Prop } from '@/types/project'
import { useAssets } from './useAssets'
import type { AssetGroupMap } from '@/lib/assets/grouping'
import { groupAssetsByKind } from '@/lib/assets/grouping'

// ============ 类型定义 ============
export interface ProjectAssetsData {
    characters: Character[]
    locations: Location[]
    props: Prop[]
}

function mapCharacterAssetToProjectCharacter(asset: AssetGroupMap['character'][number]): Character {
    return {
        id: asset.id,
        name: asset.name,
        aliases: null,
        introduction: asset.introduction,
        appearances: asset.variants.map((variant) => ({
            id: variant.id,
            appearanceIndex: variant.index,
            changeReason: variant.label,
            description: variant.description,
            descriptions: null,
            imageUrl: variant.renders.find((render) => render.isSelected)?.imageUrl
                ?? variant.renders[0]?.imageUrl
                ?? null,
            media: variant.renders.find((render) => render.isSelected)?.media
                ?? variant.renders[0]?.media
                ?? null,
            imageUrls: variant.renders.map((render) => render.imageUrl ?? '').filter((value) => value.length > 0),
            imageMedias: variant.renders.map((render) => render.media).filter((media): media is MediaRef => !!media),
            previousImageUrl: variant.renders[0]?.previousImageUrl ?? null,
            previousMedia: variant.renders[0]?.previousMedia ?? null,
            previousImageUrls: variant.renders.map((render) => render.previousImageUrl ?? '').filter((value) => value.length > 0),
            previousImageMedias: variant.renders.map((render) => render.previousMedia).filter((media): media is MediaRef => !!media),
            previousDescription: null,
            previousDescriptions: null,
            selectedIndex: variant.selectionState.selectedRenderIndex,
            imageTaskRunning: asset.taskState.isRunning || variant.taskState.isRunning,
            imageErrorMessage: variant.taskState.lastError?.message ?? null,
            lastError: variant.taskState.lastError ?? asset.taskState.lastError,
        })),
        voiceType: asset.voice.voiceType,
        voiceId: asset.voice.voiceId,
        customVoiceUrl: asset.voice.customVoiceUrl,
        media: asset.voice.media,
        profileData: asset.profileData,
        profileConfirmed: asset.profileConfirmed ?? undefined,
    }
}

function mapLocationVariantToProjectImage(
    asset: AssetGroupMap['location'][number] | AssetGroupMap['prop'][number],
    variant: AssetGroupMap['location'][number]['variants'][number],
) {
    const render = variant.renders[0] ?? null
    return {
        id: variant.id,
        imageIndex: variant.index,
        description: variant.description,
        imageUrl: render?.imageUrl ?? null,
        media: render?.media ?? null,
        previousImageUrl: render?.previousImageUrl ?? null,
        previousMedia: render?.previousMedia ?? null,
        previousDescription: null,
        isSelected: render?.isSelected ?? false,
        imageTaskRunning: asset.taskState.isRunning || variant.taskState.isRunning,
        imageErrorMessage: variant.taskState.lastError?.message ?? null,
        lastError: variant.taskState.lastError ?? asset.taskState.lastError,
    }
}

function mapLocationAssetToProjectLocation(asset: AssetGroupMap['location'][number]): Location {
    return {
        id: asset.id,
        name: asset.name,
        summary: asset.summary,
        selectedImageId: asset.selectedVariantId,
        images: asset.variants.map((variant) => mapLocationVariantToProjectImage(asset, variant)),
    }
}

function mapPropAssetToProjectProp(asset: AssetGroupMap['prop'][number]): Prop {
    return {
        id: asset.id,
        name: asset.name,
        summary: asset.summary,
        selectedImageId: asset.selectedVariantId,
        images: asset.variants.map((variant) => mapLocationVariantToProjectImage(asset, variant)),
    }
}

export function mapAssetGroupsToProjectAssetsData(groups: AssetGroupMap): ProjectAssetsData {
    return {
        characters: groups.character.map(mapCharacterAssetToProjectCharacter),
        locations: groups.location.map(mapLocationAssetToProjectLocation),
        props: groups.prop.map(mapPropAssetToProjectProp),
    }
}

// ============ 查询 Hooks ============

/**
 * 获取项目资产（角色 + 场景）
 */
export function useProjectAssets(projectId: string | null) {
    const assetsQuery = useAssets({
        scope: 'project',
        projectId,
    })
    const groups = groupAssetsByKind(assetsQuery.data)
    const data = mapAssetGroupsToProjectAssetsData(groups)

    return {
        ...assetsQuery,
        data,
    }
}

/**
 * 获取项目角色
 */
export function useProjectCharacters(projectId: string | null) {
    const assetsQuery = useProjectAssets(projectId)
    return {
        ...assetsQuery,
        data: assetsQuery.data.characters,
    }
}

/**
 * 获取项目场景
 */
export function useProjectLocations(projectId: string | null) {
    const assetsQuery = useProjectAssets(projectId)
    return {
        ...assetsQuery,
        data: assetsQuery.data.locations,
    }
}

export function useProjectProps(projectId: string | null) {
    const assetsQuery = useProjectAssets(projectId)
    return {
        ...assetsQuery,
        data: assetsQuery.data.props,
    }
}

/**
 * 刷新项目资产
 * 🔥 同时刷新 projectAssets 和 projectData 两个缓存
 *    - projectAssets: 用于直接订阅 useProjectAssets 的组件
 *    - projectData: 用于 ProjectWorkspace（通过 useProjectData 获取 characters/locations）
 */
export function useRefreshProjectAssets(projectId: string | null) {
    const queryClient = useQueryClient()

    return () => {
        if (projectId) {
            _ulogInfo('[刷新资产] 同时刷新 projectAssets / projectData / tasks 缓存')
            queryClient.invalidateQueries({
                queryKey: queryKeys.assets.all('project', projectId),
            })
            queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
            queryClient.invalidateQueries({ queryKey: queryKeys.projectData(projectId) })
            queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all(projectId), exact: false })
        }
    }
}
