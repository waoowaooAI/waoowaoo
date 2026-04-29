'use client'
import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
import { useTranslations } from 'next-intl'

/**
 * useLocationActions - 场景资产操作 Hook
 * 从 AssetsStage 提取，负责场景的 CRUD 和图片生成操作
 * 
 * 🔥 V6.5 重构：直接订阅 useProjectAssets，消除 props drilling
 */

import { useCallback } from 'react'
import { isAbortError } from '@/lib/error-utils'
import {
    useAssetActions,
    useProjectAssets,
    useRefreshProjectAssets,
    useRegenerateSingleLocationImage,
    useRegenerateLocationGroup,
    useDeleteProjectLocation,
    useSelectProjectLocationImage,
    useConfirmProjectLocationSelection,
    useUpdateProjectLocationDescription,
} from '@/lib/query/hooks'

interface UseLocationActionsProps {
    projectId: string
    assetType?: 'location' | 'prop'
    showToast?: (message: string, type: 'success' | 'warning' | 'error') => void
}

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error) return error.message
    if (typeof error === 'object' && error !== null) {
        const message = (error as { message?: unknown }).message
        if (typeof message === 'string') return message
    }
    return fallback
}

export function useLocationActions({
    projectId,
    assetType = 'location',
    showToast
}: UseLocationActionsProps) {
    const t = useTranslations('assets')
    // 🔥 直接订阅缓存 - 消除 props drilling
    const { data: assets } = useProjectAssets(projectId)
    const locations = assetType === 'prop' ? assets?.props ?? [] : assets?.locations ?? []
    const propActions = useAssetActions({ scope: 'project', projectId, kind: 'prop' })
    const assetKey = assetType === 'prop' ? 'prop' : 'location'

    // 🔥 使用刷新函数 - mutations 完成后刷新缓存
    const refreshAssets = useRefreshProjectAssets(projectId)

    // 🔥 V6.7: 使用重新生成mutation hooks
    const regenerateSingleImage = useRegenerateSingleLocationImage(projectId)
    const regenerateGroup = useRegenerateLocationGroup(projectId)
    const deleteLocationMutation = useDeleteProjectLocation(projectId)
    const selectLocationImageMutation = useSelectProjectLocationImage(projectId)
    const confirmLocationSelectionMutation = useConfirmProjectLocationSelection(projectId, assetType)
    const updateLocationDescriptionMutation = useUpdateProjectLocationDescription(projectId)

    // 删除场景
    const handleDeleteLocation = useCallback(async (locationId: string) => {
        if (!confirm(t(`${assetKey}.deleteConfirm`))) return
        try {
            if (assetType === 'prop') {
                await propActions.remove(locationId)
            } else {
                await deleteLocationMutation.mutateAsync(locationId)
            }
        } catch (error: unknown) {
            if (!isAbortError(error)) {
                alert(t(`${assetKey}.deleteFailed`, { error: getErrorMessage(error, t('common.unknownError')) }))
            }
        }
    }, [assetKey, assetType, deleteLocationMutation, propActions, t])

    // 处理场景图片选择
    const handleSelectLocationImage = useCallback(async (locationId: string, imageIndex: number | null) => {
        try {
            if (assetType === 'prop') {
                await propActions.selectRender({ id: locationId, imageIndex })
            } else {
                await selectLocationImageMutation.mutateAsync({ locationId, imageIndex })
            }
        } catch (error: unknown) {
            if (isAbortError(error)) {
                _ulogInfo('请求被中断（可能是页面刷新），后端仍在执行')
                return
            }
            alert(t('image.selectFailed', { error: getErrorMessage(error, t('common.unknownError')) }))
        }
    }, [assetType, propActions, selectLocationImageMutation, t])

    // 确认选择并删除其他候选图片
    const handleConfirmLocationSelection = useCallback(async (locationId: string) => {
        try {
            await confirmLocationSelectionMutation.mutateAsync({ locationId })
            showToast?.(`✓ ${t('image.confirmSuccess')}`, 'success')
        } catch (error: unknown) {
            if (isAbortError(error)) {
                _ulogInfo('请求被中断（可能是页面刷新），后端仍在执行')
                return
            }
            showToast?.(t('image.confirmFailed', { error: getErrorMessage(error, t('common.unknownError')) }), 'error')
        }
    }, [assetType, confirmLocationSelectionMutation, showToast, t])

    // 单张重新生成场景图片 - 🔥 V6.7: 使用mutation hook
    const handleRegenerateSingleLocation = useCallback(async (locationId: string, imageIndex: number) => {
        try {
            if (assetType === 'prop') {
                await propActions.generate({ id: locationId, imageIndex })
            } else {
                await regenerateSingleImage.mutateAsync({ locationId, imageIndex })
            }
        } catch (error: unknown) {
            if (!isAbortError(error)) {
                alert(t('image.regenerateFailed', { error: getErrorMessage(error, t('common.unknownError')) }))
            }
            throw error
        }
    }, [assetType, propActions, regenerateSingleImage, t])

    // 整组重新生成场景图片 - 🔥 V6.7: 使用mutation hook
    const handleRegenerateLocationGroup = useCallback(async (locationId: string, count?: number) => {
        try {
            if (assetType === 'prop') {
                await propActions.generate({ id: locationId, count })
            } else {
                await regenerateGroup.mutateAsync({ locationId, count })
            }
        } catch (error: unknown) {
            if (!isAbortError(error)) {
                alert(t('image.regenerateFailed', { error: getErrorMessage(error, t('common.unknownError')) }))
            }
            throw error
        }
    }, [assetType, propActions, regenerateGroup, t])

    // 更新场景描述 - 🔥 保存到服务器
    const handleUpdateLocationDescription = useCallback(async (
        locationId: string,
        newDescription: string
    ) => {
        try {
            if (assetType === 'prop') {
                const prop = locations.find((item) => item.id === locationId)
                const firstImageId = prop?.images?.[0]?.id
                await propActions.update(locationId, {
                    summary: newDescription,
                })
                if (firstImageId) {
                    await propActions.updateVariant(locationId, firstImageId, {
                        description: newDescription,
                    })
                }
            } else {
                await updateLocationDescriptionMutation.mutateAsync({
                    locationId,
                    description: newDescription,
                })
            }
            refreshAssets()
        } catch (error: unknown) {
            if (!isAbortError(error)) {
                _ulogError('更新描述失败:', getErrorMessage(error, t('common.unknownError')))
            }
        }
    }, [assetType, locations, propActions, refreshAssets, updateLocationDescriptionMutation, t])

    return {
        // 🔥 暴露 locations 供组件使用
        locations,
        handleDeleteLocation,
        handleSelectLocationImage,
        handleConfirmLocationSelection,
        handleRegenerateSingleLocation,
        handleRegenerateLocationGroup,
        handleUpdateLocationDescription
    }
}
