'use client'

import { useState, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useDeleteVoice } from '@/lib/query/mutations'
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

interface VoiceCardProps {
    voice: Voice
    onSelect?: (voice: Voice) => void  // 选择模式时使用
    isSelected?: boolean  // 是否被选中
    selectionMode?: boolean  // 是否在选择模式
}

export function VoiceCard({ voice, onSelect, isSelected = false, selectionMode = false }: VoiceCardProps) {
    // 🔥 使用 mutation hook
    const deleteVoice = useDeleteVoice()
    const t = useTranslations('assetHub')
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [isPlaying, setIsPlaying] = useState(false)
    const audioRef = useRef<HTMLAudioElement | null>(null)

    // 播放预览
    const handlePlay = () => {
        if (!voice.customVoiceUrl) return

        if (isPlaying && audioRef.current) {
            audioRef.current.pause()
            setIsPlaying(false)
            return
        }

        const audio = new Audio(voice.customVoiceUrl)
        audioRef.current = audio
        audio.onended = () => setIsPlaying(false)
        audio.onerror = () => setIsPlaying(false)
        audio.play()
        setIsPlaying(true)
    }

    // 删除音色
    const handleDelete = () => {
        deleteVoice.mutate(voice.id, {
            onSettled: () => setShowDeleteConfirm(false)
        })
    }

    // 选择模式点击
    const handleCardClick = () => {
        if (selectionMode && onSelect) {
            onSelect(voice)
        }
    }

    // 性别图标
    const genderIcon = voice.gender === 'male' ? 'M' : voice.gender === 'female' ? 'F' : ''

    return (
        <div
            onClick={handleCardClick}
            className={`glass-surface overflow-hidden relative group transition-all ${selectionMode ? 'cursor-pointer hover:ring-2 hover:ring-[var(--glass-focus-ring-strong)]' : ''
                } ${isSelected ? 'ring-2 ring-[var(--glass-stroke-focus)]' : ''}`}
        >
            {/* 选中标记 */}
            {isSelected && (
                <div className="absolute top-2 right-2 w-6 h-6 glass-chip glass-chip-info rounded-full flex items-center justify-center z-10 p-0">
                    <AppIcon name="checkSolid" className="w-4 h-4 text-white" />
                </div>
            )}

            {/* 音色图标区域 */}
            <div className="relative bg-[var(--glass-bg-muted)] p-6 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full glass-surface-soft flex items-center justify-center">
                    <AppIcon name="mic" className="w-8 h-8 text-[var(--glass-tone-info-fg)]" />
                </div>

                {/* 性别标签 */}
                {genderIcon && (
                    <div className="absolute top-2 left-2 glass-chip glass-chip-neutral text-xs px-2 py-0.5 rounded-full">
                        {genderIcon}
                    </div>
                )}

                {/* 试听按钮 */}
                {voice.customVoiceUrl && (
                    <button
                        onClick={(e) => { e.stopPropagation(); handlePlay() }}
                        className={`absolute bottom-2 right-2 w-10 h-10 rounded-full glass-btn-base flex items-center justify-center transition-all ${isPlaying
                            ? 'glass-btn-tone-info animate-pulse'
                            : 'glass-btn-secondary text-[var(--glass-tone-info-fg)]'
                            }`}
                    >
                        {isPlaying ? (
                            <AppIcon name="pause" className="w-5 h-5" />
                        ) : (
                            <AppIcon name="play" className="w-5 h-5" />
                        )}
                    </button>
                )}
            </div>

            {/* 信息区域 */}
            <div className="p-3">
                <div className="flex items-center justify-between">
                    <h3 className="font-medium text-[var(--glass-text-primary)] text-sm truncate">{voice.name}</h3>
                    {!selectionMode && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true) }}
                            className="glass-btn-base glass-btn-soft h-6 w-6 rounded-md text-[var(--glass-tone-danger-fg)] flex items-center justify-center opacity-0 group-hover:opacity-100"
                        >
                            <AppIcon name="trash" className="w-4 h-4" />
                        </button>
                    )}
                </div>
                {voice.description && (
                    <p className="mt-1 text-xs text-[var(--glass-text-secondary)] line-clamp-2">{voice.description}</p>
                )}
                {voice.voicePrompt && !voice.description && (
                    <p className="mt-1 text-xs text-[var(--glass-text-tertiary)] line-clamp-2 italic">{voice.voicePrompt}</p>
                )}
            </div>

            {/* 删除确认 */}
            {showDeleteConfirm && (
                <div className="absolute inset-0 glass-overlay flex items-center justify-center z-20">
                    <div className="glass-surface-modal p-4 m-4" onClick={(e) => e.stopPropagation()}>
                        <p className="mb-4 text-sm text-[var(--glass-text-primary)]">{t('confirmDeleteVoice')}</p>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setShowDeleteConfirm(false)} className="glass-btn-base glass-btn-secondary px-3 py-1.5 rounded-lg text-sm">{t('cancel')}</button>
                            <button onClick={handleDelete} className="glass-btn-base glass-btn-danger px-3 py-1.5 rounded-lg text-sm">{t('delete')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default VoiceCard
