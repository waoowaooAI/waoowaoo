'use client'
import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
import { useTranslations } from 'next-intl'

import { useState, useCallback } from 'react'
import { useCreateProjectPanelVariant, useRefreshEpisodeData } from '@/lib/query/hooks'
import { NovelPromotionStoryboard, NovelPromotionPanel } from '@/types/project'

/**
 * usePanelVariant - 镜头变体操作 Hook
 * 
 * 管理镜头变体相关的状态和操作
 * 🔥 使用乐观更新：点击后立即插入占位 panel，不等待 API 响应
 */

export interface VariantData {
    title: string
    description: string
    shot_type: string
    camera_move: string
    video_prompt: string
}

export interface VariantOptions {
    includeCharacterAssets: boolean
    includeLocationAsset: boolean
}

interface VariantModalState {
    panelId: string
    panelNumber: number | null
    description: string | null
    imageUrl: string | null
    storyboardId: string
}

interface UsePanelVariantProps {
    projectId: string
    episodeId: string
    // 🔥 需要 setLocalStoryboards 来实现乐观更新
    setLocalStoryboards: React.Dispatch<React.SetStateAction<NovelPromotionStoryboard[]>>
}

export function usePanelVariant({ projectId, episodeId, setLocalStoryboards }: UsePanelVariantProps) {
    const t = useTranslations('storyboard')
    // 🔥 使用 React Query 刷新 - 刷新 episodeData（包含 storyboards 和 panels）
    const onRefresh = useRefreshEpisodeData(projectId, episodeId)
    const createPanelVariantMutation = useCreateProjectPanelVariant(projectId)
    // 变体模态框状态
    const [variantModalState, setVariantModalState] = useState<VariantModalState | null>(null)

    // 正在提交变体任务的 Panel ID
    const [submittingVariantPanelId, setSubmittingVariantPanelId] = useState<string | null>(null)

    // 打开变体模态框
    const openVariantModal = useCallback((panel: VariantModalState) => {
        setVariantModalState(panel)
    }, [])

    // 关闭变体模态框
    const closeVariantModal = useCallback(() => {
        setVariantModalState(null)
    }, [])

    // 执行变体生成
    const generatePanelVariant = useCallback(async (
        sourcePanelId: string,
        storyboardId: string,
        insertAfterPanelId: string,
        variant: VariantData,
        options: VariantOptions
    ): Promise<void> => {
        setSubmittingVariantPanelId(sourcePanelId)

        // 🔥 乐观更新：立即在本地状态中插入临时占位 panel
        const tempPanelId = `temp-variant-${Date.now()}`
        setLocalStoryboards(prev => prev.map(sb => {
            if (sb.id !== storyboardId) return sb

            // 找到插入位置
            const panels: NovelPromotionPanel[] = sb.panels || []
            const insertIndex = panels.findIndex((panel) => panel.id === insertAfterPanelId)
            if (insertIndex === -1) return sb

            // 创建临时占位 panel
            const tempPanel: NovelPromotionPanel = {
                id: tempPanelId,
                storyboardId,
                panelIndex: insertIndex + 1,
                panelNumber: (panels[insertIndex]?.panelNumber || 0) + 0.5, // 临时编号
                description: variant.description || t('variant.generating'),
                shotType: variant.shot_type || null,
                cameraMove: variant.camera_move || null,
                videoPrompt: variant.video_prompt || null,
                imageUrl: null,
                imageTaskRunning: true, // 🔥 显示加载状态
                characters: null,
                location: null,
                candidateImages: null,
                srtSegment: null,
                srtStart: null,
                srtEnd: null,
                duration: null,
                imagePrompt: null,
                media: null,
                imageHistory: null,
                videoUrl: null,
                videoMedia: null,
                lipSyncVideoUrl: null,
                lipSyncVideoMedia: null,
                sketchImageUrl: null,
                sketchImageMedia: null,
                previousImageUrl: null,
                previousImageMedia: null,
                photographyRules: null,
                actingNotes: null,
                imageErrorMessage: null,
            }

            // 插入临时 panel
            const newPanels = [
                ...panels.slice(0, insertIndex + 1),
                tempPanel,
                ...panels.slice(insertIndex + 1)
            ]

            _ulogInfo('[usePanelVariant] 🎯 乐观更新：插入临时占位 panel', tempPanelId)

            return {
                ...sb,
                panels: newPanels
            }
        }))

        // 🔥 立即关闭模态框（不等待 API）
        setVariantModalState(null)

        try {
            const data = await createPanelVariantMutation.mutateAsync({
                storyboardId,
                insertAfterPanelId,
                sourcePanelId,
                variant,
                includeCharacterAssets: options.includeCharacterAssets,
                includeLocationAsset: options.includeLocationAsset,
            })

            // API 成功：Panel 已在服务端创建（无图片），用真实 panelId 替换临时 ID
            // 这样 task state 监控能正确匹配到这个 panel
            const realPanelId = data?.panelId
            _ulogInfo('[usePanelVariant] ✅ API 成功，realPanelId:', realPanelId)

            if (realPanelId) {
                setLocalStoryboards(prev => prev.map(sb => {
                    if (sb.id !== storyboardId) return sb
                    const panels = (sb.panels || []).map(p =>
                        p.id === tempPanelId ? { ...p, id: realPanelId } : p,
                    )
                    return { ...sb, panels }
                }))
            }

            // 刷新获取完整的服务端状态
            if (onRefresh) {
                await onRefresh()
            }
        } catch (error) {
            // API 失败：移除临时 panel 并显示错误
            setLocalStoryboards(prev => prev.map(sb => {
                if (sb.id !== storyboardId) return sb
                const panels = (sb.panels || []).filter((panel) => panel.id !== tempPanelId)
                return { ...sb, panels }
            }))
            _ulogError('[usePanelVariant] 生成变体失败:', error)
            throw error
        } finally {
            setSubmittingVariantPanelId(null)
        }
    }, [createPanelVariantMutation, onRefresh, setLocalStoryboards, t])

    // 处理模态框中的变体选择
    const handleVariantSelect = useCallback(async (
        variant: VariantData,
        options: VariantOptions
    ) => {
        if (!variantModalState) return

        // 在原 panel 之后插入变体
        await generatePanelVariant(
            variantModalState.panelId,
            variantModalState.storyboardId,
            variantModalState.panelId, // 在当前 panel 之后插入
            variant,
            options
        )
    }, [variantModalState, generatePanelVariant])

    return {
        // 状态
        variantModalState,
        submittingVariantPanelId,
        isVariantModalOpen: !!variantModalState,
        isSubmittingVariantTask: !!submittingVariantPanelId,

        // 操作
        openVariantModal,
        closeVariantModal,
        generatePanelVariant,
        handleVariantSelect
    }
}
