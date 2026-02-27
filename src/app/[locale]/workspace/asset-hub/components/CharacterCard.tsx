'use client'
import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { resolveErrorDisplay } from '@/lib/errors/display'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
    useGenerateCharacterImage,
    useSelectCharacterImage,
    useUndoCharacterImage,
    useUploadCharacterImage,
    useDeleteCharacter,
    useDeleteCharacterAppearance,
    useUploadCharacterVoice
} from '@/lib/query/mutations'
import VoiceSettings from './VoiceSettings'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import TaskStatusOverlay from '@/components/task/TaskStatusOverlay'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { PRIMARY_APPEARANCE_INDEX } from '@/lib/constants'
import { AppIcon } from '@/components/ui/icons'

interface Appearance {
    id: string
    appearanceIndex: number
    changeReason: string
    description: string | null
    imageUrl: string | null
    imageUrls: string[]
    selectedIndex: number | null
    previousImageUrl: string | null
    previousImageUrls: string[]
    imageTaskRunning: boolean
    lastError?: { code: string; message: string } | null
}

interface Character {
    id: string
    name: string
    folderId: string | null
    customVoiceUrl: string | null
    appearances: Appearance[]
}

interface CharacterCardProps {
    character: Character
    onImageClick?: (url: string) => void
    onImageEdit?: (type: 'character' | 'location', id: string, name: string, imageIndex: number, appearanceIndex?: number) => void
    onVoiceDesign?: (characterId: string, characterName: string) => void
    onEdit?: (character: Character, appearance: Appearance) => void
    onVoiceSelect?: (characterId: string) => void
}

export function CharacterCard({ character, onImageClick, onImageEdit, onVoiceDesign, onEdit, onVoiceSelect }: CharacterCardProps) {
    // 🔥 使用 mutation hooks
    const generateImage = useGenerateCharacterImage()
    const selectImage = useSelectCharacterImage()
    const undoImage = useUndoCharacterImage()
    const uploadImage = useUploadCharacterImage()
    const deleteCharacter = useDeleteCharacter()
    const deleteAppearance = useDeleteCharacterAppearance()
    const uploadVoice = useUploadCharacterVoice()

    const t = useTranslations('assetHub')
    const tAssets = useTranslations('assets')
    const fileInputRef = useRef<HTMLInputElement>(null)
    const voiceInputRef = useRef<HTMLInputElement>(null)

    const [activeAppearance, setActiveAppearance] = useState(0)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [showDeleteMenu, setShowDeleteMenu] = useState(false)
    const latestSelectRequestRef = useRef(0)

    // 计算属性
    const appearance = character.appearances[activeAppearance] || character.appearances[0]
    const isPrimaryAppearance = appearance?.appearanceIndex === PRIMARY_APPEARANCE_INDEX
    const appearanceCount = character.appearances.length

    // URL 验证函数
    const isValidUrl = (url: string | null | undefined): boolean => {
        if (!url || url.trim() === '') return false
        if (url.startsWith('/')) return true
        if (url.startsWith('data:') || url.startsWith('blob:')) return true
        try { new URL(url); return true } catch { return false }
    }

    const imageUrls = appearance?.imageUrls || []
    const hasMultipleImages = imageUrls.filter(u => isValidUrl(u)).length > 1
    const effectiveSelectedIndex: number | null = appearance?.selectedIndex ?? null
    const currentImageUrl = appearance?.imageUrl || (effectiveSelectedIndex !== null ? imageUrls[effectiveSelectedIndex] : null) || imageUrls.find(u => u) || null
    const hasPreviousVersion = !!(appearance?.previousImageUrl || (appearance?.previousImageUrls && appearance.previousImageUrls.length > 0))

    const displayImageUrl = isValidUrl(currentImageUrl) ? currentImageUrl : null
    const serverTaskRunning = !!appearance?.imageTaskRunning
    const transientSubmitting = generateImage.isPending
    const isAppearanceTaskRunning = serverTaskRunning || transientSubmitting
    const taskErrorDisplay = !isAppearanceTaskRunning && appearance?.lastError
        ? resolveErrorDisplay(appearance.lastError)
        : null
    const displayTaskPresentation = isAppearanceTaskRunning
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: displayImageUrl ? 'process' : 'generate',
            resource: 'image',
            hasOutput: !!displayImageUrl,
        })
        : null
    const selectImageRunningState = selectImage.isPending
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'process',
            resource: 'image',
            hasOutput: !!displayImageUrl,
        })
        : null

    // 生成图片
    const handleGenerate = () => {
        generateImage.mutate(
            { characterId: character.id, appearanceIndex: appearance.appearanceIndex },
            { onError: (error) => alert(error.message || t('generateFailed')) }
        )
    }

    // 选择图片（依赖 query 缓存乐观更新）
    const handleSelectImage = (imageIndex: number | null) => {
        if (imageIndex === effectiveSelectedIndex) return
        const requestId = latestSelectRequestRef.current + 1
        latestSelectRequestRef.current = requestId
        selectImage.mutate({
            characterId: character.id,
            appearanceIndex: appearance.appearanceIndex,
            imageIndex,
            confirm: false
        }, {
            onError: (error) => {
                if (latestSelectRequestRef.current !== requestId) return
                alert(error.message || t('selectFailed'))
            }
        })
    }

    // 确认选择
    const handleConfirmSelection = () => {
        const requestId = latestSelectRequestRef.current + 1
        latestSelectRequestRef.current = requestId
        selectImage.mutate({
            characterId: character.id,
            appearanceIndex: appearance.appearanceIndex,
            imageIndex: effectiveSelectedIndex,
            confirm: true
        }, {
            onError: (error) => {
                if (latestSelectRequestRef.current !== requestId) return
                alert(error.message || t('selectFailed'))
            }
        })
    }

    // 撤回
    const handleUndo = () => {
        undoImage.mutate({ characterId: character.id, appearanceIndex: appearance.appearanceIndex })
    }

    // 上传图片
    const handleUpload = () => {
        const file = fileInputRef.current?.files?.[0]
        if (!file) return

        uploadImage.mutate(
            {
                file,
                characterId: character.id,
                appearanceIndex: appearance.appearanceIndex,
                labelText: `${character.name} - ${appearance.changeReason}`,
                imageIndex: effectiveSelectedIndex ?? undefined
            },
            {
                onError: (error) => alert(error.message || t('uploadFailed')),
                onSettled: () => {
                    if (fileInputRef.current) fileInputRef.current.value = ''
                }
            }
        )
    }

    // 删除角色
    const handleDelete = () => {
        deleteCharacter.mutate(character.id, {
            onSettled: () => setShowDeleteConfirm(false)
        })
    }

    // 删除子形象
    const handleDeleteAppearance = () => {
        deleteAppearance.mutate(
            { characterId: character.id, appearanceIndex: appearance.appearanceIndex },
            {
                onSuccess: () => setActiveAppearance(0),
                onSettled: () => setShowDeleteMenu(false)
            }
        )
    }

    // 上传音色
    const handleUploadVoice = () => {
        const file = voiceInputRef.current?.files?.[0]
        if (!file) return

        uploadVoice.mutate(
            { file, characterId: character.id },
            {
                onSettled: () => {
                    if (voiceInputRef.current) voiceInputRef.current.value = ''
                }
            }
        )
    }

    // 多图选择模式
    if (hasMultipleImages) {
        return (
            <div className="col-span-3 glass-surface p-4 relative">
                {/* 隐藏输入 */}
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
                <input ref={voiceInputRef} type="file" accept="audio/*" onChange={handleUploadVoice} className="hidden" />

                {/* 顶部：名字 + 操作 */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--glass-text-primary)]">{character.name}</span>
                        <span className="glass-chip glass-chip-neutral px-2 py-0.5 text-xs">{appearance.changeReason}</span>
                        {isPrimaryAppearance ? (
                            <span className="glass-chip glass-chip-success px-2 py-0.5 text-xs">{tAssets('character.primary')}</span>
                        ) : (
                            <span className="glass-chip glass-chip-info px-2 py-0.5 text-xs">{tAssets('character.secondary')}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={() => { _ulogInfo('[CharacterCard] 多图模式 - 重新生成按钮点击, characterId:', character.id, 'appearanceCount:', appearanceCount); handleGenerate() }} disabled={isAppearanceTaskRunning} className="glass-btn-base glass-btn-soft h-6 w-6 rounded-md" title={t('regenerate')}>
                            {isAppearanceTaskRunning ? (
                                <TaskStatusInline state={displayTaskPresentation} className="[&_span]:sr-only [&_svg]:text-[var(--glass-tone-info-fg)]" />
                            ) : (
                                <AppIcon name="refresh" className="w-4 h-4 text-[var(--glass-tone-info-fg)]" />
                            )}
                        </button>
                        {hasPreviousVersion && (
                            <button onClick={handleUndo} className="glass-btn-base glass-btn-soft h-6 w-6 rounded-md" title={tAssets('image.undo')}>
                                <AppIcon name="sparkles" className="w-4 h-4 text-[var(--glass-tone-warning-fg)]" />
                            </button>
                        )}
                        <button onClick={(e) => {
                            e.stopPropagation()
                            _ulogInfo('[CharacterCard] 多图模式 - 删除按钮点击, characterId:', character.id, 'appearanceCount:', appearanceCount, 'showDeleteMenu:', showDeleteMenu)
                            if (appearanceCount <= 1) {
                                setShowDeleteConfirm(true)
                                return
                            }
                            setShowDeleteMenu(!showDeleteMenu)
                        }} className="glass-btn-base glass-btn-soft h-6 w-6 rounded-md">
                            <AppIcon name="trash" className="w-4 h-4 text-[var(--glass-tone-danger-fg)]" />
                        </button>
                    </div>
                </div>

                {/* 任务失败错误提示 */}
                {taskErrorDisplay && !isAppearanceTaskRunning && (
                    <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-[var(--glass-danger-ring)] text-[var(--glass-tone-danger-fg)]">
                        <AppIcon name="alert" className="w-4 h-4 shrink-0" />
                        <span className="text-xs line-clamp-2">{taskErrorDisplay.message}</span>
                    </div>
                )}

                {/* 图片列表 */}
                <div className="grid grid-cols-3 gap-3">
                    {imageUrls.map((url, index) => {
                        if (!isValidUrl(url)) return null
                        const validUrl = url as string
                        const isSelected = effectiveSelectedIndex === index
                        return (
                            <div key={index} className="relative group/thumb">
                                <div
                                    onClick={() => onImageClick?.(validUrl)}
                                    className={`rounded-lg overflow-hidden border-2 cursor-zoom-in transition-all ${isSelected ? 'border-[var(--glass-stroke-success)] ring-2 ring-[var(--glass-success-ring)]' : 'border-[var(--glass-stroke-base)] hover:border-[var(--glass-stroke-focus)]'}`}
                                >
                                    <MediaImageWithLoading
                                        src={validUrl}
                                        alt={`${character.name} ${index + 1}`}
                                        containerClassName="w-full min-h-[96px]"
                                        className="w-full h-auto object-contain"
                                    />
                                    <div className={`absolute bottom-2 left-2 text-xs px-2 py-0.5 rounded ${isSelected ? 'glass-chip glass-chip-success' : 'glass-chip glass-chip-neutral'}`}>
                                        {tAssets('image.optionNumber', { number: index + 1 })}
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleSelectImage(isSelected ? null : index) }}
                                    className={`absolute top-2 right-2 glass-btn-base w-7 h-7 rounded-full flex items-center justify-center ${isSelected ? 'glass-btn-tone-success' : 'glass-btn-secondary'}`}
                                >
                                    <AppIcon name="check" className="w-4 h-4" />
                                </button>
                            </div>
                        )
                    })}
                </div>

                {/* 确认按钮 */}
                {effectiveSelectedIndex !== null && (
                    <div className="mt-4 flex justify-end">
                        <button onClick={handleConfirmSelection} disabled={selectImage.isPending} className="glass-btn-base glass-btn-tone-success px-4 py-2 rounded-lg flex items-center gap-2 text-sm">
                            {selectImage.isPending ? (
                                <TaskStatusInline state={selectImageRunningState} className="text-white [&>span]:sr-only [&_svg]:text-white" />
                            ) : (
                                <AppIcon name="check" className="w-4 h-4" />
                            )}
                            {tAssets('image.confirmOption', { number: effectiveSelectedIndex + 1 })}
                        </button>
                    </div>
                )}

                {/* 音色设置 */}
                <VoiceSettings
                    characterId={character.id}
                    characterName={character.name}
                    customVoiceUrl={character.customVoiceUrl}
                    onVoiceDesign={onVoiceDesign}
                    onVoiceSelect={onVoiceSelect}
                    compact={true}
                />

                {/* 删除菜单 */}
                {showDeleteMenu && appearanceCount > 1 && (
                    <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowDeleteMenu(false)} />
                        <div className="absolute right-4 top-12 z-20 glass-surface-modal py-1 min-w-[120px]">
                            <button onClick={handleDeleteAppearance} className="glass-btn-base glass-btn-soft w-full justify-start rounded-none px-3 py-1.5 text-left text-xs">{tAssets('image.deleteThis')}</button>
                            <button onClick={() => { setShowDeleteMenu(false); setShowDeleteConfirm(true) }} className="glass-btn-base glass-btn-soft w-full justify-start rounded-none px-3 py-1.5 text-left text-xs text-[var(--glass-tone-danger-fg)]">{tAssets('character.deleteWhole')}</button>
                        </div>
                    </>
                )}

                {/* 删除确认对话框 - 多图模式也需要 */}
                {showDeleteConfirm && (
                    <div className="fixed inset-0 glass-overlay flex items-center justify-center z-50">
                        <div className="glass-surface-modal p-4 m-4 max-w-sm">
                            <p className="mb-4 text-sm text-[var(--glass-text-primary)]">{t('confirmDeleteCharacter')}</p>
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

    // 单图模式
    return (
        <div className="glass-surface overflow-hidden relative group">
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
            <input ref={voiceInputRef} type="file" accept="audio/*" onChange={handleUploadVoice} className="hidden" />

            {/* 图片区域 */}
            <div className="relative bg-[var(--glass-bg-muted)] min-h-[100px]">
                {displayImageUrl ? (
                    <>
                        <MediaImageWithLoading
                            src={displayImageUrl}
                            alt={character.name}
                            containerClassName="w-full min-h-[120px]"
                            className="w-full h-auto object-contain cursor-zoom-in"
                            onClick={() => onImageClick?.(displayImageUrl)}
                        />
                        {/* 操作按钮 - 非生成时显示 */}
                        {!isAppearanceTaskRunning && (
                            <div className="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => fileInputRef.current?.click()} disabled={uploadImage.isPending} className="glass-btn-base glass-btn-secondary h-7 w-7 rounded-full">
                                    <AppIcon name="upload" className="w-4 h-4 text-[var(--glass-tone-success-fg)]" />
                                </button>
                                <button onClick={() => onImageEdit?.('character', character.id, character.name, effectiveSelectedIndex ?? 0, appearance.appearanceIndex)} className="glass-btn-base glass-btn-tone-info h-7 w-7 rounded-full">
                                    <AppIcon name="edit" className="w-4 h-4" />
                                </button>
                                <button onClick={handleGenerate} className="glass-btn-base glass-btn-secondary h-7 w-7 rounded-full">
                                    <AppIcon name="refresh" className="w-4 h-4 text-[var(--glass-tone-info-fg)]" />
                                </button>
                                {hasPreviousVersion && (
                                    <button onClick={handleUndo} className="glass-btn-base glass-btn-secondary h-7 w-7 rounded-full">
                                        <AppIcon name="sparkles" className="w-4 h-4 text-[var(--glass-tone-warning-fg)]" />
                                    </button>
                                )}
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-[var(--glass-text-tertiary)]">
                        <AppIcon name="image" className="w-12 h-12 mb-3" />
                        <button onClick={handleGenerate} className="glass-btn-base glass-btn-primary flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg">
                            <AppIcon name="sparklesAlt" className="w-4 h-4" />
                            {t('generate')}
                        </button>
                    </div>
                )}
                {isAppearanceTaskRunning && (
                    <TaskStatusOverlay state={displayTaskPresentation} />
                )}
                {taskErrorDisplay && !isAppearanceTaskRunning && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--glass-danger-ring)] text-[var(--glass-tone-danger-fg)] p-3 gap-1">
                        <AppIcon name="alert" className="w-6 h-6" />
                        <span className="text-xs text-center font-medium line-clamp-3">{taskErrorDisplay.message}</span>
                    </div>
                )}
            </div>

            {/* 信息区域 */}
            <div className="p-3">
                <div className="flex items-center justify-between">
                    <h3 className="font-medium text-[var(--glass-text-primary)] text-sm truncate">{character.name}</h3>
                    <div className="flex items-center gap-1">
                        {/* 编辑按钮 */}
                        <button
                            onClick={() => onEdit?.(character, appearance)}
                            className="glass-btn-base glass-btn-soft h-6 w-6 rounded-md opacity-0 group-hover:opacity-100"
                            title={tAssets('video.panelCard.editPrompt')}
                        >
                            <AppIcon name="edit" className="w-4 h-4 text-[var(--glass-text-secondary)]" />
                        </button>
                        {/* 删除按钮 */}
                        <button onClick={() => appearanceCount <= 1 ? setShowDeleteConfirm(true) : setShowDeleteMenu(!showDeleteMenu)} className="glass-btn-base glass-btn-soft h-6 w-6 rounded-md text-[var(--glass-tone-danger-fg)] opacity-0 group-hover:opacity-100">
                            <AppIcon name="trash" className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* 形象切换 */}
                {appearanceCount > 1 && (
                    <div className="flex gap-1 mt-2 overflow-x-auto">
                        {character.appearances.map((app, index) => (
                            <button key={app.id} onClick={() => setActiveAppearance(index)} className={`glass-btn-base px-2 py-0.5 text-xs rounded-full whitespace-nowrap ${index === activeAppearance ? 'glass-btn-primary' : 'glass-btn-soft text-[var(--glass-text-secondary)]'}`}>
                                {app.changeReason || `形象 ${app.appearanceIndex}`}
                            </button>
                        ))}
                    </div>
                )}

                {appearance?.description && <p className="mt-2 text-xs text-[var(--glass-text-secondary)] line-clamp-2">{appearance.description}</p>}

                {/* 音色设置 */}
                <VoiceSettings
                    characterId={character.id}
                    characterName={character.name}
                    customVoiceUrl={character.customVoiceUrl}
                    onVoiceDesign={onVoiceDesign}
                    onVoiceSelect={onVoiceSelect}
                    compact={true}
                />
            </div>

            {/* 删除确认 */}
            {showDeleteConfirm && (
                <div className="absolute inset-0 glass-overlay flex items-center justify-center z-20">
                    <div className="glass-surface-modal p-4 m-4">
                        <p className="mb-4 text-sm text-[var(--glass-text-primary)]">{t('confirmDeleteCharacter')}</p>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setShowDeleteConfirm(false)} className="glass-btn-base glass-btn-secondary px-3 py-1.5 rounded-lg text-sm">{t('cancel')}</button>
                            <button onClick={handleDelete} className="glass-btn-base glass-btn-danger px-3 py-1.5 rounded-lg text-sm">{t('delete')}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* 删除菜单 */}
            {showDeleteMenu && appearanceCount > 1 && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowDeleteMenu(false)} />
                    <div className="absolute right-3 top-auto bottom-16 z-20 glass-surface-modal py-1 min-w-[120px]">
                        <button onClick={handleDeleteAppearance} className="glass-btn-base glass-btn-soft w-full justify-start rounded-none px-3 py-1.5 text-left text-xs">{tAssets('image.deleteThis')}</button>
                        <button onClick={() => { setShowDeleteMenu(false); setShowDeleteConfirm(true) }} className="glass-btn-base glass-btn-soft w-full justify-start rounded-none px-3 py-1.5 text-left text-xs text-[var(--glass-tone-danger-fg)]">{tAssets('character.deleteWhole')}</button>
                    </div>
                </>
            )}
        </div>
    )
}
