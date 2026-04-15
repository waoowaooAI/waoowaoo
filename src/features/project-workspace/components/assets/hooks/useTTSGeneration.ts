'use client'
import { logError as _ulogError } from '@/lib/logging/core'
import { useTranslations } from 'next-intl'

/**
 * useTTSGeneration - TTS 和音色相关逻辑
 * 从 AssetsStage.tsx 提取
 * 
 * 🔥 V6.5 重构：直接订阅 useProjectAssets，消除 props drilling
 */

import { useState } from 'react'
import {
    useProjectAssets,
    useRefreshProjectAssets,
    useUpdateProjectCharacterVoiceSettings,
    useSaveProjectDesignedVoice,
} from '@/lib/query/hooks'

interface VoiceDesignCharacter {
    id: string
    name: string
    hasExistingVoice: boolean
}

interface UseTTSGenerationProps {
    projectId: string
}

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error) return error.message
    if (typeof error === 'object' && error !== null) {
        const message = (error as { message?: unknown }).message
        if (typeof message === 'string') return message
    }
    return fallback
}

export function useTTSGeneration({
    projectId
}: UseTTSGenerationProps) {
    const t = useTranslations('assets')
    // 🔥 直接订阅缓存 - 消除 props drilling
    const { data: assets } = useProjectAssets(projectId)
    const characters = assets?.characters ?? []

    // 🔥 使用刷新函数
    const refreshAssets = useRefreshProjectAssets(projectId)
    const updateVoiceSettingsMutation = useUpdateProjectCharacterVoiceSettings(projectId)
    const saveDesignedVoiceMutation = useSaveProjectDesignedVoice(projectId)

    const [voiceDesignCharacter, setVoiceDesignCharacter] = useState<VoiceDesignCharacter | null>(null)

    // 音色变更回调 - 🔥 保存到服务器而不是本地更新
    const handleVoiceChange = async (characterId: string, voiceType: string, voiceId: string, customVoiceUrl?: string) => {
        try {
            await updateVoiceSettingsMutation.mutateAsync({
                characterId,
                voiceType: voiceType as 'qwen-designed' | 'uploaded' | 'custom' | null,
                voiceId,
                customVoiceUrl,
            })

            // 🔥 刷新缓存
            refreshAssets()
        } catch (error: unknown) {
            _ulogError('更新音色失败:', getErrorMessage(error, t('common.unknownError')))
        }
    }

    // 打开 AI 声音设计对话框
    const handleOpenVoiceDesign = (characterId: string, characterName: string) => {
        const character = characters.find(c => c.id === characterId)
        setVoiceDesignCharacter({
            id: characterId,
            name: characterName,
            hasExistingVoice: !!character?.customVoiceUrl
        })
    }

    // 保存 AI 设计的声音
    const handleVoiceDesignSave = async (voiceId: string, audioBase64: string) => {
        if (!voiceDesignCharacter) return

        try {
            await saveDesignedVoiceMutation.mutateAsync({
                characterId: voiceDesignCharacter.id,
                voiceId,
                audioBase64,
            })
            refreshAssets()
            alert(t('tts.voiceDesignSaved', { name: voiceDesignCharacter.name }))
        } catch (error: unknown) {
            alert(t('tts.saveVoiceDesignFailed', { error: getErrorMessage(error, t('common.unknownError')) }))
        } finally {
            setVoiceDesignCharacter(null)
        }
    }

    // 关闭声音设计对话框
    const handleCloseVoiceDesign = () => {
        setVoiceDesignCharacter(null)
    }

    return {
        // 🔥 暴露 characters 供组件使用
        characters,
        voiceDesignCharacter,
        handleVoiceChange,
        handleOpenVoiceDesign,
        handleVoiceDesignSave,
        handleCloseVoiceDesign
    }
}
