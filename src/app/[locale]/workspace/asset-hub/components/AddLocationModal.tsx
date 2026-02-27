'use client'
import { logError as _ulogError } from '@/lib/logging/core'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ART_STYLES } from '@/lib/constants'
import { useAiDesignLocation, useCreateAssetHubLocation } from '@/lib/query/hooks'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { AppIcon } from '@/components/ui/icons'

interface AddLocationModalProps {
    folderId: string | null
    onClose: () => void
    onSuccess: () => void
}

// 内联 SVG 图标
const XMarkIcon = ({ className }: { className?: string }) => (
    <AppIcon name="close" className={className} />
)

const SparklesIcon = ({ className }: { className?: string }) => (
    <AppIcon name="sparklesAlt" className={className} />
)

export function AddLocationModal({ folderId, onClose, onSuccess }: AddLocationModalProps) {
    const t = useTranslations('assetHub')

    // 表单字段
    const [name, setName] = useState('')
    const [summary, setSummary] = useState('')
    const [aiInstruction, setAiInstruction] = useState('')
    const [artStyle, setArtStyle] = useState('american-comic')

    const aiDesignMutation = useAiDesignLocation()
    const createLocationMutation = useCreateAssetHubLocation()
    const isSubmitting = createLocationMutation.isPending
    const isAiDesigning = aiDesignMutation.isPending
    const aiDesigningState = isAiDesigning
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'generate',
            resource: 'image',
            hasOutput: false,
        })
        : null
    const submittingState = isSubmitting
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'generate',
            resource: 'image',
            hasOutput: false,
        })
        : null

    // AI 设计描述
    const handleAiDesign = async () => {
        if (!aiInstruction.trim()) return

        try {
            const data = await aiDesignMutation.mutateAsync(aiInstruction.trim())
            setSummary(data.prompt || '')
            setAiInstruction('')
        } catch (error) {
            _ulogError('AI设计失败:', error)
        }
    }

    // 提交
    const handleSubmit = async () => {
        if (!name.trim() || !summary.trim()) return

        try {
            await createLocationMutation.mutateAsync({
                name: name.trim(),
                summary: summary.trim(),
                folderId,
                artStyle
            })
            onSuccess()
        } catch (error) {
            _ulogError('创建场景失败:', error)
        }
    }

    return (
        <div className="fixed inset-0 glass-overlay flex items-center justify-center z-50 p-4">
            <div className="glass-surface-modal max-w-lg w-full max-h-[85vh] overflow-y-auto">
                <div className="p-6">
                    {/* 标题 */}
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold text-[var(--glass-text-primary)]">
                            {t('modal.newLocation')}
                        </h3>
                        <button
                            onClick={onClose}
                            className="glass-btn-base glass-btn-soft h-8 w-8 rounded-full flex items-center justify-center text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)]"
                        >
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="space-y-5">
                        {/* AI 设计区域 */}
                        <div className="glass-surface-soft border border-[var(--glass-stroke-base)] rounded-xl p-4 space-y-3">
                            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--glass-text-primary)]">
                                <SparklesIcon className="w-4 h-4" />
                                <span>{t('modal.aiDesign')}</span>
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={aiInstruction}
                                    onChange={(e) => setAiInstruction(e.target.value)}
                                    placeholder={t('modal.aiDesignLocationPlaceholder')}
                                    className="glass-input-base flex-1 px-3 py-2 text-sm"
                                    disabled={isAiDesigning}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault()
                                            handleAiDesign()
                                        }
                                    }}
                                />
                                <button
                                    onClick={handleAiDesign}
                                    disabled={isAiDesigning || !aiInstruction.trim()}
                                    className="glass-btn-base glass-btn-tone-info px-4 py-2 rounded-lg text-sm"
                                >
                                    {isAiDesigning ? (
                                        <TaskStatusInline state={aiDesigningState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                                    ) : (
                                        <>
                                            <SparklesIcon className="w-4 h-4" />
                                            <span>{t('modal.generate')}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                            <p className="glass-field-hint">
                                {t('modal.aiDesignLocationTip')}
                            </p>
                        </div>

                        {/* 场景名称 */}
                        <div className="space-y-2">
                            <label className="glass-field-label block">
                                {t('modal.locationNameLabel')}
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('modal.locationNamePlaceholder')}
                                className="glass-input-base w-full px-3 py-2 text-sm"
                            />
                        </div>

                        {/* 风格选择 */}
                        <div className="space-y-2">
                            <label className="glass-field-label block">
                                画面风格
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {ART_STYLES.map((style) => (
                                    <button
                                        key={style.value}
                                        type="button"
                                        onClick={() => setArtStyle(style.value)}
                                        className={`glass-btn-base px-3 py-2 rounded-lg text-sm border flex items-center justify-start gap-2 transition-all ${artStyle === style.value
                                            ? 'glass-btn-tone-info border-[var(--glass-stroke-focus)]'
                                            : 'glass-btn-soft border-[var(--glass-stroke-base)] text-[var(--glass-text-secondary)] hover:border-[var(--glass-stroke-strong)]'
                                            }`}
                                    >
                                        <span>{style.preview}</span>
                                        <span>{style.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 场景描述 */}
                        <div className="space-y-2">
                            <label className="glass-field-label block">
                                {t('modal.locationSummaryLabel')}
                            </label>
                            <textarea
                                value={summary}
                                onChange={(e) => setSummary(e.target.value)}
                                placeholder={t('modal.locationSummaryPlaceholder')}
                                className="glass-textarea-base w-full h-40 px-3 py-2 text-sm resize-none"
                            />
                        </div>
                    </div>

                    {/* 按钮区 */}
                    <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-[var(--glass-stroke-base)]">
                        <button
                            onClick={onClose}
                            className="glass-btn-base glass-btn-secondary px-4 py-2 rounded-lg text-sm"
                            disabled={isSubmitting}
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting || !name.trim() || !summary.trim()}
                            className="glass-btn-base glass-btn-primary px-4 py-2 rounded-lg text-sm"
                        >
                            {isSubmitting ? (
                                <TaskStatusInline state={submittingState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                            ) : (
                                <span>{t('modal.addLocation')}</span>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
