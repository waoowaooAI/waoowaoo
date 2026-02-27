'use client'

import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import VoicePickerDialog from '@/app/[locale]/workspace/asset-hub/components/VoicePickerDialog'
import VoiceCreationModal from '@/app/[locale]/workspace/asset-hub/components/VoiceCreationModal'
import { AppIcon } from '@/components/ui/icons'

type BindingTab = 'select' | 'upload' | 'design'

interface SpeakerVoiceBindingDialogProps {
    isOpen: boolean
    speaker: string
    projectId: string
    episodeId: string
    onClose: () => void
    onBound: (speaker: string, audioUrl: string, voiceType: string, voiceId?: string) => void
}

/**
 * 内联音色绑定弹窗
 * 用于不在资产库中的角色/发言人在配音阶段直接绑定音色
 * 提供三种绑定方式：从音色库选择、上传音频、AI设计音色（Tab 切换）
 */
export default function SpeakerVoiceBindingDialog({
    isOpen,
    speaker,
    onClose,
    onBound,
}: SpeakerVoiceBindingDialogProps) {
    const t = useTranslations('voice.inlineBinding')
    const [activeTab, setActiveTab] = useState<BindingTab>('select')
    // 子弹窗打开标记
    const [subDialogOpen, setSubDialogOpen] = useState(false)

    const handleClose = useCallback(() => {
        setActiveTab('select')
        setSubDialogOpen(false)
        onClose()
    }, [onClose])

    // 从音色库选择后的回调
    const handleVoiceSelected = useCallback((voice: {
        id: string
        customVoiceUrl: string | null
        voiceId: string | null
        voiceType: string
    }) => {
        if (voice.customVoiceUrl) {
            onBound(speaker, voice.customVoiceUrl, voice.voiceType, voice.voiceId ?? undefined)
        }
        setSubDialogOpen(false)
        onClose()
    }, [speaker, onBound, onClose])

    // AI 设计音色或上传音频后的回调
    const handleCreationSuccess = useCallback(() => {
        // 创建成功后切换到选择模式，让用户从音色库选取刚创建的音色
        setActiveTab('select')
        setSubDialogOpen(true)
    }, [])

    const handleTabClick = useCallback((tab: BindingTab) => {
        if (tab === 'select') {
            setSubDialogOpen(true)
        } else {
            setSubDialogOpen(true)
        }
        setActiveTab(tab)
    }, [])

    if (!isOpen) return null
    if (typeof document === 'undefined') return null

    // 音色库选择 — 直接渲染 VoicePickerDialog
    if (activeTab === 'select' && subDialogOpen) {
        return (
            <VoicePickerDialog
                isOpen
                onClose={handleClose}
                onSelect={handleVoiceSelected}
            />
        )
    }

    // 上传/AI设计 — 渲染 VoiceCreationModal
    if ((activeTab === 'upload' || activeTab === 'design') && subDialogOpen) {
        return (
            <VoiceCreationModal
                isOpen
                folderId={null}
                initialVoiceName={speaker}
                onClose={handleClose}
                onSuccess={handleCreationSuccess}
            />
        )
    }

    // 主弹窗：Tab 切换
    return createPortal(
        <>
            <div className="fixed inset-0 z-[9999] glass-overlay" onClick={handleClose} />
            <div
                className="fixed z-[10000] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 glass-surface-modal w-full max-w-md overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* 头部 */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)]">
                    <div className="flex items-center gap-2 min-w-0">
                        <AppIcon name="mic" className="w-5 h-5 text-[var(--glass-tone-info-fg)] shrink-0" />
                        <h2 className="font-semibold text-[var(--glass-text-primary)] truncate">
                            {t('title', { speaker })}
                        </h2>
                    </div>
                    <button onClick={handleClose} className="glass-btn-base glass-btn-soft p-1 text-[var(--glass-text-tertiary)] shrink-0">
                        <AppIcon name="close" className="w-5 h-5" />
                    </button>
                </div>

                {/* 描述 */}
                <div className="px-5 pt-4 pb-2">
                    <p className="text-sm text-[var(--glass-text-secondary)]">
                        {t('description')}
                    </p>
                </div>

                {/* 胶囊分段选择器 */}
                <div className="px-5 py-3">
                    {(() => {
                        const tabs = [
                            { id: 'select' as const, label: t('selectFromLibrary') },
                            { id: 'upload' as const, label: t('uploadAudio') },
                            { id: 'design' as const, label: t('aiDesign') },
                        ]
                        const activeIdx = tabs.findIndex(tab => tab.id === activeTab)
                        return (
                            <div className="rounded-lg p-0.5" style={{ background: 'rgba(0,0,0,0.04)' }}>
                                <div className="relative grid gap-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
                                    <div
                                        className="absolute bottom-0.5 top-0.5 rounded-md bg-white transition-transform duration-200"
                                        style={{
                                            boxShadow: '0 1px 4px rgba(0,0,0,0.15), 0 0 0 0.5px rgba(0,0,0,0.06)',
                                            width: `calc(100% / ${tabs.length})`,
                                            transform: `translateX(${Math.max(0, activeIdx) * 100}%)`,
                                        }}
                                    />
                                    {tabs.map((tab) => (
                                        <button
                                            key={tab.id}
                                            onClick={() => handleTabClick(tab.id)}
                                            className={`relative z-[1] px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${activeTab === tab.id
                                                ? 'text-[var(--glass-text-primary)] font-medium'
                                                : 'text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)]'
                                                }`}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )
                    })()}
                </div>

                {/* Tab 内容区 — 显示描述和进入按钮 */}
                <div className="p-5">
                    <div className="text-center py-6">
                        <div className={`w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-3 ${activeTab === 'select' ? 'bg-[var(--glass-tone-info-bg)]'
                            : activeTab === 'upload' ? 'bg-[var(--glass-tone-success-bg)]'
                                : 'bg-[var(--glass-accent-bg,var(--glass-tone-info-bg))]'
                            }`}>
                            <AppIcon
                                name={activeTab === 'select' ? 'mic' : activeTab === 'upload' ? 'cloudUpload' : 'idea'}
                                className={`w-6 h-6 ${activeTab === 'select' ? 'text-[var(--glass-tone-info-fg)]'
                                    : activeTab === 'upload' ? 'text-[var(--glass-tone-success-fg)]'
                                        : 'text-[var(--glass-accent-from,var(--glass-tone-info-fg))]'
                                    }`}
                            />
                        </div>
                        <p className="text-sm text-[var(--glass-text-secondary)] mb-4">
                            {activeTab === 'select' && t('selectFromLibraryDesc')}
                            {activeTab === 'upload' && t('uploadAudioDesc')}
                            {activeTab === 'design' && t('aiDesignDesc')}
                        </p>
                        <button
                            onClick={() => setSubDialogOpen(true)}
                            className="glass-btn-base glass-btn-primary px-8 py-2.5 rounded-lg text-sm font-medium"
                        >
                            {activeTab === 'select' && t('selectFromLibrary')}
                            {activeTab === 'upload' && t('uploadAudio')}
                            {activeTab === 'design' && t('aiDesign')}
                        </button>
                    </div>
                </div>
            </div>
        </>,
        document.body,
    )
}
