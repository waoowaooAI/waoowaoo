'use client'
import { logError as _ulogError } from '@/lib/logging/core'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { useGlobalVoices } from '@/lib/query/hooks'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { AppIcon } from '@/components/ui/icons'

interface Voice {
    id: string
    name: string
    description: string | null
    voiceId: string | null
    voiceType: string
    customVoiceUrl: string | null
    voicePrompt: string | null
    gender: string | null
    language: string
    folderId: string | null
}

interface VoicePickerDialogProps {
    isOpen: boolean
    onClose: () => void
    onSelect: (voice: Voice) => void
}

export default function VoicePickerDialog({ isOpen, onClose, onSelect }: VoicePickerDialogProps) {
    const t = useTranslations('assetHub')
    const tv = useTranslations('voice.voiceDesign')
    const voicesQuery = useGlobalVoices()
    const [selectedVoice, setSelectedVoice] = useState<Voice | null>(null)
    const [playingId, setPlayingId] = useState<string | null>(null)
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const voices = (voicesQuery.data || []) as Voice[]
    const loading = isOpen ? voicesQuery.isFetching : false
    const loadingState = loading
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'process',
            resource: 'audio',
            hasOutput: false,
        })
        : null

    const refetchVoices = voicesQuery.refetch

    useEffect(() => {
        if (!isOpen) return
        refetchVoices().catch((error) => {
            _ulogError('加载音色失败:', error)
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen])

    // 播放预览
    const handlePlay = (voice: Voice) => {
        if (!voice.customVoiceUrl) return

        if (playingId === voice.id && audioRef.current) {
            audioRef.current.pause()
            setPlayingId(null)
            return
        }

        if (audioRef.current) {
            audioRef.current.pause()
        }

        const audio = new Audio(voice.customVoiceUrl)
        audioRef.current = audio
        audio.onended = () => setPlayingId(null)
        audio.onerror = () => setPlayingId(null)
        audio.play()
        setPlayingId(voice.id)
    }

    // 确认选择
    const handleConfirm = () => {
        if (selectedVoice) {
            onSelect(selectedVoice)
            onClose()
        }
    }

    // 关闭时清理
    const handleClose = () => {
        if (audioRef.current) {
            audioRef.current.pause()
        }
        setSelectedVoice(null)
        setPlayingId(null)
        onClose()
    }

    if (!isOpen) return null
    if (typeof document === 'undefined') return null

    const dialogContent = (
        <>
            {/* 背景遮罩 */}
            <div className="fixed inset-0 z-[9999] glass-overlay" onClick={handleClose} />

            {/* 对话框 */}
            <div
                className="fixed z-[10000] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 glass-surface-modal w-full max-w-2xl max-h-[80vh] overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* 头部 */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)]">
                    <div className="flex items-center gap-2">
                        <AppIcon name="mic" className="w-5 h-5 text-[var(--glass-tone-info-fg)]" />
                        <h2 className="font-semibold text-[var(--glass-text-primary)]">{t('voicePickerTitle')}</h2>
                    </div>
                    <button onClick={handleClose} className="glass-btn-base glass-btn-soft p-1 text-[var(--glass-text-tertiary)]">
                        <AppIcon name="close" className="w-5 h-5" />
                    </button>
                </div>

                {/* 内容区 */}
                <div className="p-5 overflow-y-auto max-h-[60vh]">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <TaskStatusInline state={loadingState} />
                        </div>
                    ) : voices.length === 0 ? (
                        <div className="text-center py-12 text-[var(--glass-text-secondary)]">
                            <AppIcon name="mic" className="w-16 h-16 mx-auto mb-4 text-[var(--glass-text-tertiary)]" />
                            <p>{t('voicePickerEmpty')}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {voices.map(voice => {
                                const isSelected = selectedVoice?.id === voice.id
                                const isPlaying = playingId === voice.id
                                const genderIcon = voice.gender === 'male' ? 'M' : voice.gender === 'female' ? 'F' : ''

                                return (
                                    <div
                                        key={voice.id}
                                        onClick={() => setSelectedVoice(voice)}
                                        className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all ${isSelected
                                            ? 'border-[var(--glass-stroke-focus)] bg-[var(--glass-tone-info-bg)]'
                                            : 'border-[var(--glass-stroke-base)] hover:border-[var(--glass-stroke-focus)] bg-[var(--glass-bg-surface)]'
                                            }`}
                                    >
                                        {/* 选中标记 */}
                                        {isSelected && (
                                            <div className="absolute -top-1.5 -right-1.5 w-5 h-5 glass-chip glass-chip-info rounded-full flex items-center justify-center p-0">
                                                <AppIcon name="checkSolid" className="w-3 h-3 text-white" />
                                            </div>
                                        )}

                                        {/* 音色信息 */}
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full glass-surface-soft flex items-center justify-center flex-shrink-0">
                                                <AppIcon name="mic" className="w-5 h-5 text-[var(--glass-tone-info-fg)]" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1">
                                                    <span className="font-medium text-[var(--glass-text-primary)] text-sm truncate">{voice.name}</span>
                                                    {genderIcon && <span className="glass-chip glass-chip-neutral text-[10px] px-1.5 py-0">{genderIcon}</span>}
                                                </div>
                                                {voice.description && (
                                                    <p className="text-xs text-[var(--glass-text-secondary)] truncate">{voice.description}</p>
                                                )}
                                            </div>
                                        </div>

                                        {/* 试听按钮 */}
                                        {voice.customVoiceUrl && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handlePlay(voice) }}
                                                className={`mt-2 w-full py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 glass-btn-base ${isPlaying
                                                    ? 'glass-btn-tone-info'
                                                    : 'glass-btn-secondary text-[var(--glass-text-secondary)]'
                                                    }`}
                                            >
                                                {isPlaying ? (
                                                    <>
                                                        <AppIcon name="pause" className="w-3 h-3" />
                                                        {tv('playing')}
                                                    </>
                                                ) : (
                                                    <>
                                                        <AppIcon name="play" className="w-3 h-3" />
                                                        {tv('preview')}
                                                    </>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* 底部操作 */}
                <div className="flex gap-2 p-4 border-t border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)]">
                    <button
                        onClick={handleClose}
                        className="glass-btn-base glass-btn-secondary flex-1 py-2 rounded-lg text-sm"
                    >
                        {t('cancel')}
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!selectedVoice}
                        className="glass-btn-base glass-btn-primary flex-1 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                    >
                        {t('voicePickerConfirm')}
                    </button>
                </div>
            </div>
        </>
    )

    return createPortal(dialogContent, document.body)
}
