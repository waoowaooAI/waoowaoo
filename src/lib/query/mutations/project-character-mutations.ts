import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../keys'
import { resolveTaskResponse } from '@/lib/task/client'
import {
  invalidateQueryTemplates,
  requestJsonWithError,
  requestTaskResponseWithError,
} from './mutation-shared'

export function useUpdateProjectCharacterIntroduction(projectId: string) {
    const queryClient = useQueryClient()
    const invalidateProjectAssets = () =>
        invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])

    return useMutation({
        mutationFn: async ({
            characterId,
            introduction,
        }: {
            characterId: string
            introduction: string
        }) => {
            return await requestJsonWithError(`/api/projects/${projectId}/character`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ characterId, introduction }),
            }, 'Failed to update character introduction')
        },
        onSuccess: invalidateProjectAssets,
    })
}

/**
 * AI 修改项目角色形象描述
 */

export function useAiModifyProjectAppearanceDescription(projectId: string) {
    return useMutation({
        mutationFn: async ({
            characterId,
            appearanceId,
            currentDescription,
            modifyInstruction,
        }: {
            characterId: string
            appearanceId: string
            currentDescription: string
            modifyInstruction: string
        }) => {
            const response = await requestTaskResponseWithError(
                `/api/projects/${projectId}/ai-modify-appearance`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        characterId,
                        appearanceId,
                        currentDescription,
                        modifyInstruction,
                    }),
                },
                'Failed to modify appearance description',
            )
            return resolveTaskResponse<{ modifiedDescription?: string }>(response)
        },
    })
}

/**
 * AI 修改项目场景描述
 */

export function useAiCreateProjectCharacter(projectId: string) {
    return useMutation({
        mutationFn: async (payload: { userInstruction: string }) => {
            const response = await requestTaskResponseWithError(
                `/api/projects/${projectId}/ai-create-character`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                },
                'Failed to design character',
            )
            return await resolveTaskResponse<{ prompt?: string }>(response)
        },
    })
}

/**
 * 上传临时媒体（项目）
 */

export function useUploadProjectTempMedia() {
    return useMutation({
        mutationFn: async (payload: { imageBase64?: string; base64?: string; extension?: string; type?: string }) => {
            return await requestJsonWithError<{ success: boolean; url?: string; key?: string }>(
                '/api/asset-hub/upload-temp',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                },
                '上传失败',
            )
        },
    })
}

/**
 * 参考图提取角色描述（项目）
 */

export function useExtractProjectReferenceCharacterDescription(projectId: string) {
    return useMutation({
        mutationFn: async (referenceImageUrls: string[]) => {
            const response = await requestTaskResponseWithError(
                `/api/projects/${projectId}/reference-to-character`,
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

/**
 * 创建项目角色
 */

export function useCreateProjectCharacter(projectId: string) {
    const queryClient = useQueryClient()
    const invalidateProjectAssets = () =>
        invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])

    return useMutation({
        mutationFn: async (payload: {
            name: string
            description: string
            generateFromReference?: boolean
            referenceImageUrls?: string[]
            customDescription?: string
            count?: number
        }) =>
            await requestJsonWithError(
                `/api/projects/${projectId}/character`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                },
                'Failed to create character',
            ),
        onSuccess: invalidateProjectAssets,
    })
}

/**
 * 为项目角色添加子形象
 */

export function useCreateProjectCharacterAppearance(projectId: string) {
    const queryClient = useQueryClient()
    const invalidateProjectAssets = () =>
        invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])

    return useMutation({
        mutationFn: async (payload: {
            characterId: string
            changeReason: string
            description: string
        }) =>
            await requestJsonWithError(
                `/api/projects/${projectId}/character/appearance`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                },
                'Failed to create character appearance',
            ),
        onSuccess: invalidateProjectAssets,
    })
}

/**
 * 全局资产分析（项目）
 */

export function useConfirmProjectCharacterSelection(projectId: string) {
    const queryClient = useQueryClient()
    const invalidateProjectAssets = () =>
        invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])
    return useMutation({
        mutationFn: async ({ characterId, appearanceId }: { characterId: string; appearanceId: string }) =>
            await requestJsonWithError(
                `/api/projects/${projectId}/character/confirm-selection`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ characterId, appearanceId }),
                },
                '确认选择失败',
            ),
        onSettled: invalidateProjectAssets,
    })
}
