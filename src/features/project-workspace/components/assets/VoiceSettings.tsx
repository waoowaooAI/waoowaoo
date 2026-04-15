'use client'

/**
 * 音色设置组件 - 从 CharacterCard 提取
 * 支持上传自定义音频和 AI 声音设计
 */

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { shouldShowError } from '@/lib/error-utils'
import { useUploadProjectCharacterVoice } from '@/lib/query/mutations'
import { AppIcon } from '@/components/ui/icons'

interface VoiceSettingsProps {
    characterId: string
    characterName: string
    customVoiceUrl: string | null | undefined
    projectId: string
    onVoiceChange?: (characterId: string, customVoiceUrl?: string) => void
    onVoiceDesign?: (characterId: string, characterName: string) => void
    onSelectFromHub?: (characterId: string) => void  // 从资产中心选择音色
    compact?: boolean  // 紧凑模式（单图卡片用）
}

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error) return error.message
    if (typeof error === 'object' && error !== null) {
        const message = (error as { message?: unknown }).message
        if (typeof message === 'string') return message
    }
    return fallback
}

export default function VoiceSettings({
    characterId,
    characterName,
    customVoiceUrl,
    projectId,
    onVoiceChange,
    onVoiceDesign,
    onSelectFromHub,
    compact = false
}: VoiceSettingsProps) {
    const t = useTranslations('assets')
    // 🔥 使用 mutation
    const uploadVoice = useUploadProjectCharacterVoice(projectId)
    const voiceFileInputRef = useRef<HTMLInputElement>(null)
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const [isPreviewingVoice, setIsPreviewingVoice] = useState(false)

    const hasCustomVoice = !!customVoiceUrl

    const confirmUploadVoice = () => {
        return window.confirm(t('tts.uploadQwenHint'))
    }

    // 预览音色（播放/暂停自定义音频）
    const handlePreviewVoice = async () => {
        if (!customVoiceUrl) return

        // 如果正在播放，点击则暂停
        if (isPreviewingVoice && audioRef.current) {
            audioRef.current.pause()
            setIsPreviewingVoice(false)
            return
        }

        try {
            if (audioRef.current) {
                audioRef.current.pause()
            }
            const audio = new Audio(customVoiceUrl)
            audioRef.current = audio
            audio.play()
            audio.onended = () => setIsPreviewingVoice(false)
            audio.onerror = () => setIsPreviewingVoice(false)
            setIsPreviewingVoice(true)
        } catch (error: unknown) {
            if (shouldShowError(error)) {
                alert(t('tts.previewFailed', { error: getErrorMessage(error, t('common.unknownError')) }))
            }
            setIsPreviewingVoice(false)
        }
    }

    // 上传自定义音频
    const handleUploadVoice = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !projectId) return

        uploadVoice.mutate(
            { file, characterId },
            {
                onSuccess: (data) => {
                    const result = (data || {}) as UploadedVoiceResult
                    onVoiceChange?.(characterId, result.audioUrl)
                },
                onError: (error) => {
                    if (shouldShowError(error)) {
                        alert(t('tts.uploadFailed', { error: error.message }))
                    }
                },
                onSettled: () => {
                    if (voiceFileInputRef.current) {
                        voiceFileInputRef.current.value = ''
                    }
                }
            }
        )
    }

    // 紧凑模式样式
    const containerClass = compact
        ? 'border border-[var(--glass-stroke-base)] rounded-xl p-3 bg-[var(--glass-bg-surface-strong)]'
        : 'mt-4 border border-[var(--glass-stroke-base)] rounded-xl p-4 bg-[var(--glass-bg-surface-strong)]'


    const iconSize = compact ? 'w-5 h-5' : 'w-6 h-6'
    const innerIconSize = compact ? 'w-3 h-3' : 'w-3.5 h-3.5'

    const [isExpanded, setIsExpanded] = useState(false)

    return (
        <div className={containerClass}>
            {/* 折叠标题行 - 点击展开/收起 */}
            <button
                type="button"
                onClick={() => setIsExpanded((v) => !v)}
                className="w-full flex items-center justify-between cursor-pointer"
            >
                <div className="flex items-center gap-2">
                    <div className={`${iconSize} rounded-full flex items-center justify-center ${hasCustomVoice ? 'bg-[var(--glass-bg-muted)]' : 'bg-[var(--glass-tone-warning-bg)]'}`}>
                        <AppIcon name="mic" className={`${innerIconSize} ${hasCustomVoice ? 'text-[var(--glass-text-secondary)]' : 'text-[var(--glass-tone-warning-fg)]'}`} />
                    </div>
                    <span className={`text-${compact ? 'xs' : 'sm'} font-medium text-[var(--glass-text-secondary)]`}>
                        {t('tts.title')}
                    </span>
                    <span className={`w-2 h-2 rounded-full ${hasCustomVoice ? 'bg-[var(--glass-tone-success-fg)]' : 'bg-[var(--glass-tone-warning-fg)]'}`} />
                </div>
                <AppIcon
                    name="chevronDown"
                    className={`w-4 h-4 text-[var(--glass-text-tertiary)] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                />
            </button>

            {/* 展开内容 */}
            {isExpanded && (
                <div className="mt-3 pt-3 border-t border-[var(--glass-stroke-base)]">
                    {/* 隐藏的音频文件输入 */}
                    <input
                        ref={voiceFileInputRef}
                        type="file"
                        accept="audio/*"
                        onChange={handleUploadVoice}
                        className="hidden"
                    />

                    <div className="flex flex-wrap gap-2 w-full justify-center">
                        {/* 上传音频按钮 */}
                        <button
                            onClick={() => {
                                if (!confirmUploadVoice()) return
                                voiceFileInputRef.current?.click()
                            }}
                            disabled={uploadVoice.isPending}
                            className="flex-1 min-w-[80px] px-2 py-1.5 bg-[var(--glass-bg-surface)] border border-[var(--glass-stroke-base)] rounded-lg text-xs text-[var(--glass-text-secondary)] font-medium hover:border-[var(--glass-stroke-success)] hover:bg-[var(--glass-tone-success-bg)] hover:text-[var(--glass-tone-success-fg)] transition-all relative group whitespace-nowrap"
                        >
                            <div className="flex items-center justify-center gap-1">
                                {hasCustomVoice && <div className="w-1.5 h-1.5 bg-[var(--glass-tone-success-fg)] rounded-full flex-shrink-0"></div>}
                                <span>{uploadVoice.isPending ? t('tts.uploading') : hasCustomVoice ? t('tts.uploaded') : t('tts.uploadAudio')}</span>
                            </div>
                        </button>

                        {/* 从资产中心选择按钮 */}
                        {onSelectFromHub && (
                            <button
                                onClick={() => onSelectFromHub(characterId)}
                                className="flex-1 min-w-[80px] px-2 py-1.5 bg-[var(--glass-bg-surface)] border border-[var(--glass-stroke-focus)] rounded-lg text-xs text-[var(--glass-tone-info-fg)] font-medium hover:border-[var(--glass-stroke-focus)] hover:bg-[var(--glass-tone-info-bg)] transition-all whitespace-nowrap"
                            >
                                <div className="flex items-center justify-center gap-1">
                                    <AppIcon name="copy" className="w-3.5 h-3.5 flex-shrink-0" />
                                    <span>{t('assetLibrary.button')}</span>
                                </div>
                            </button>
                        )}

                        {/* AI设计按钮 */}
                        {onVoiceDesign && (
                            <button
                                onClick={() => onVoiceDesign(characterId, characterName)}
                                className="glass-btn-base glass-btn-primary flex-1 min-w-[80px] px-2 py-1.5 text-xs font-medium whitespace-nowrap"
                            >
                                <div className="flex items-center justify-center gap-1">
                                    <AppIcon name="bolt" className="w-3.5 h-3.5 flex-shrink-0" />
                                    <span>{t('modal.aiDesign')}</span>
                                </div>
                            </button>
                        )}
                    </div>

                    {/* 试听按钮 - 仅在有音频时显示 */}
                    {hasCustomVoice && (
                        <button
                            onClick={handlePreviewVoice}
                            className={`w-full mt-2 px-3 py-2 border rounded-lg text-sm font-medium transition-all ${isPreviewingVoice
                                ? 'bg-[var(--glass-accent-from)] border-[var(--glass-stroke-focus)] text-white hover:bg-[var(--glass-accent-to)]'
                                : 'bg-[var(--glass-tone-info-bg)] border-[var(--glass-stroke-focus)] text-[var(--glass-tone-info-fg)] hover:bg-[var(--glass-tone-info-bg)]'
                                }`}
                        >
                            <div className="flex items-center justify-center gap-2">
                                {isPreviewingVoice ? (
                                    <AppIcon name="pause" className="w-4 h-4" />
                                ) : (
                                    <AppIcon name="play" className="w-4 h-4" />
                                )}
                                {isPreviewingVoice ? t('tts.pause') : t('tts.preview')}
                            </div>
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
    type UploadedVoiceResult = { audioUrl?: string }
