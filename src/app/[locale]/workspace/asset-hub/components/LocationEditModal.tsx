'use client'
import { logError as _ulogError } from '@/lib/logging/core'

/**
 * 资产中心 - 场景编辑弹窗
 * 与项目级资产库的 LocationEditModal 保持一致
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { shouldShowError } from '@/lib/error-utils'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import {
    useRefreshGlobalAssets,
    useUpdateLocationName,
    useAiModifyLocationDescription,
    useUpdateLocationSummary,
} from '@/lib/query/hooks'

interface LocationEditModalProps {
    locationId: string
    locationName: string
    summary: string
    imageIndex: number
    description: string
    onClose: () => void
    onSave: () => void  // 触发生成图片
}

export function LocationEditModal({
    locationId,
    locationName,
    summary,
    imageIndex,
    description,
    onClose,
    onSave
}: LocationEditModalProps) {
    // 🔥 使用 React Query
    const onRefresh = useRefreshGlobalAssets()
    const updateName = useUpdateLocationName()
    const modifyDescription = useAiModifyLocationDescription()
    const updateSummary = useUpdateLocationSummary()
    const t = useTranslations('assets')

    const [editingName, setEditingName] = useState(locationName)
    const [editingDescription, setEditingDescription] = useState(description || summary || '')
    const [aiModifyInstruction, setAiModifyInstruction] = useState('')
    const [isAiModifying, setIsAiModifying] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const aiModifyingState = isAiModifying
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'modify',
            resource: 'image',
            hasOutput: true,
        })
        : null
    const savingState = isSaving
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'modify',
            resource: 'image',
            hasOutput: false,
        })
        : null

    // AI 修改描述
    const handleAiModify = async () => {
        if (!aiModifyInstruction.trim()) return

        try {
            setIsAiModifying(true)
            const data = await modifyDescription.mutateAsync({
                locationId,
                imageIndex,
                currentDescription: editingDescription,
                modifyInstruction: aiModifyInstruction,
            })
            setEditingDescription(data.modifiedDescription ?? '')
            setAiModifyInstruction('')
        } catch (error: unknown) {
            if (shouldShowError(error)) {
                const message = error instanceof Error ? error.message : String(error)
                alert(t('modal.modifyFailed') + ': ' + message)
            }
        } finally {
            setIsAiModifying(false)
        }
    }

    // 保存名字
    const handleSaveName = () => {
        if (!editingName.trim() || editingName === locationName) return

        updateName.mutate(
            { locationId, name: editingName.trim() },
            {
                onError: (error) => {
                    if (shouldShowError(error)) {
                        alert(t('modal.saveName') + t('errors.failed'))
                    }
                }
            }
        )
    }

    // 仅保存（不生成图片）
    const handleSaveOnly = async () => {
        try {
            setIsSaving(true)

            // 如果名字变了，先保存名字和 summary
            if (editingName.trim() !== locationName) {
                await updateName.mutateAsync({ locationId, name: editingName.trim() })
                await updateSummary.mutateAsync({ locationId, summary: editingDescription })
            } else {
                // 只保存 summary
                await updateSummary.mutateAsync({ locationId, summary: editingDescription })
            }

            onRefresh()
            onClose()
        } catch (error: unknown) {
            if (shouldShowError(error)) {
                alert(t('errors.saveFailed'))
            }
        } finally {
            setIsSaving(false)
        }
    }

    // 保存并生成图片
    const handleSaveAndGenerate = async () => {
        const descToSave = editingDescription
        const nameToSave = editingName.trim()

        // 立即关闭弹窗
        onClose()

            // 后台执行保存和生成
            ; (async () => {
                try {
                    // 保存名字和描述
                    if (nameToSave !== locationName) {
                        await updateName.mutateAsync({ locationId, name: nameToSave })
                    }
                    await updateSummary.mutateAsync({ locationId, summary: descToSave })

                    // 触发生成
                    onSave()
                    onRefresh()
                } catch (error: unknown) {
                    _ulogError('保存并生成失败:', error)
                    if (shouldShowError(error)) {
                        alert(t('errors.saveFailed'))
                    }
                }
            })()
    }

    return (
        <div className="fixed inset-0 glass-overlay flex items-center justify-center z-50 p-4">
            <div className="glass-surface-modal max-w-2xl w-full max-h-[80vh] overflow-y-auto">
                <div className="p-6 space-y-4">
                    {/* 标题 */}
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-[var(--glass-text-primary)]">
                            {t('modal.editLocation')} - {locationName}
                        </h3>
                        <button onClick={onClose} className="glass-btn-base glass-btn-soft h-8 w-8 rounded-full text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)]">
                            <AppIcon name="close" className="w-6 h-6" />
                        </button>
                    </div>

                    {/* 场景名字编辑 */}
                    <div className="space-y-2">
                        <label className="glass-field-label block">
                            {t('location.name')}
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                className="glass-input-base flex-1 px-3 py-2"
                                placeholder={t('modal.namePlaceholder')}
                            />
                            {editingName !== locationName && (
                                <button
                                    onClick={handleSaveName}
                                    disabled={updateName.isPending || !editingName.trim()}
                                    className="glass-btn-base glass-btn-tone-success px-3 py-2 rounded-lg text-sm whitespace-nowrap"
                                >
                                    {updateName.isPending ? t('smartImport.preview.saving') : t('modal.saveName')}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* AI 修改区域 */}
                    <div className="space-y-2 glass-surface-soft p-4 rounded-lg border border-[var(--glass-stroke-base)]">
                        <label className="glass-field-label block flex items-center gap-2">
                            <AppIcon name="bolt" className="w-4 h-4" />
                            {t('modal.smartModify')}
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={aiModifyInstruction}
                                onChange={(e) => setAiModifyInstruction(e.target.value)}
                                placeholder={t('modal.modifyPlaceholder')}
                                className="glass-input-base flex-1 px-3 py-2"
                                disabled={isAiModifying}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault()
                                        handleAiModify()
                                    }
                                }}
                            />
                            <button
                                onClick={handleAiModify}
                                disabled={isAiModifying || !aiModifyInstruction.trim()}
                                className="glass-btn-base glass-btn-tone-info px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                            >
                                {isAiModifying ? (
                                    <TaskStatusInline state={aiModifyingState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                                ) : (
                                    <>
                                        <AppIcon name="bolt" className="w-4 h-4" />
                                        {t('modal.smartModify')}
                                    </>
                                )}
                            </button>
                        </div>
                        <p className="glass-field-hint">
                            {t('modal.aiLocationTip')}
                        </p>
                    </div>

                    {/* 描述编辑 */}
                    <div className="space-y-2">
                        <label className="glass-field-label block">
                            {t('location.description')}
                        </label>
                        <textarea
                            value={editingDescription}
                            onChange={(e) => setEditingDescription(e.target.value)}
                            className="glass-textarea-base w-full h-48 px-3 py-2 resize-none"
                            placeholder={t('modal.descPlaceholder')}
                            disabled={isAiModifying}
                        />
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex gap-3 justify-end">
                        <button
                            onClick={onClose}
                            className="glass-btn-base glass-btn-secondary px-4 py-2 rounded-lg"
                            disabled={isSaving}
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            onClick={handleSaveOnly}
                            disabled={isSaving || !editingDescription.trim()}
                            className="glass-btn-base glass-btn-secondary px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isSaving ? (
                                <TaskStatusInline state={savingState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                            ) : (
                                t('modal.saveOnly')
                            )}
                        </button>
                        <button
                            onClick={handleSaveAndGenerate}
                            disabled={isSaving || !editingDescription.trim()}
                            className="glass-btn-base glass-btn-primary px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {t('modal.saveAndGenerate')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default LocationEditModal
