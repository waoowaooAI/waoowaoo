'use client'
import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { PRIMARY_APPEARANCE_INDEX } from '@/lib/constants'

/**
 * CharacterSection - 角色资产区块组件
 * 从 AssetsStage.tsx 提取，负责角色列表的展示和操作
 * 
 * 🔥 V6.5 重构：内部直接订阅 useProjectAssets，消除 props drilling
 */

import { Character, CharacterAppearance } from '@/types/project'
import { useProjectAssets } from '@/lib/query/hooks/useProjectAssets'
import CharacterCard from './CharacterCard'
import { AppIcon } from '@/components/ui/icons'

interface CharacterSectionProps {
    // 🔥 V6.5 删除：characters prop - 现在内部直接订阅
    projectId: string
    focusCharacterId?: string | null
    focusCharacterRequestId?: number
    activeTaskKeys: Set<string>
    onClearTaskKey: (key: string) => void
    isAnalyzingAssets: boolean
    // 回调函数
    onAddCharacter: () => void
    onDeleteCharacter: (characterId: string) => void
    onDeleteAppearance: (characterId: string, appearanceId: string) => void
    onEditAppearance: (characterId: string, characterName: string, appearance: CharacterAppearance, introduction?: string | null) => void
    // 🔥 V6.6 重构：重命名为 handleGenerateImage
    handleGenerateImage: (type: 'character' | 'location', id: string, appearanceId?: string) => void
    onSelectImage: (characterId: string, appearanceId: string, imageIndex: number | null) => void
    onConfirmSelection: (characterId: string, appearanceId: string) => void
    onRegenerateSingle: (characterId: string, appearanceId: string, imageIndex: number) => void
    onRegenerateGroup: (characterId: string, appearanceId: string) => void
    onUndo: (characterId: string, appearanceId: string) => void
    onImageClick: (imageUrl: string) => void
    onImageEdit: (characterId: string, appearanceId: string, imageIndex: number, characterName: string) => void
    onVoiceChange: (characterId: string, customVoiceUrl: string) => void
    onVoiceDesign: (characterId: string, characterName: string) => void
    onVoiceSelectFromHub: (characterId: string) => void  // 🆕 从资产中心选择音色
    onCopyFromGlobal: (characterId: string) => void  // 🆕 从资产中心复制
    // 辅助函数
    getAppearances: (character: Character) => CharacterAppearance[]
}

export default function CharacterSection({
    // 🔥 V6.5 删除：characters prop - 现在内部直接订阅
    projectId,
    focusCharacterId = null,
    focusCharacterRequestId = 0,
    activeTaskKeys,
    onClearTaskKey,
    isAnalyzingAssets,
    onAddCharacter,
    onDeleteCharacter,
    onDeleteAppearance,
    onEditAppearance,
    handleGenerateImage,
    onSelectImage,
    onConfirmSelection,
    onRegenerateSingle,
    onRegenerateGroup,
    onUndo,
    onImageClick,
    onImageEdit,
    onVoiceChange,
    onVoiceDesign,
    onVoiceSelectFromHub,
    onCopyFromGlobal,
    getAppearances
}: CharacterSectionProps) {
    const t = useTranslations('assets')
    const analyzingAssetsState = isAnalyzingAssets
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'generate',
            resource: 'image',
            hasOutput: false,
        })
        : null

    // 🔥 V6.5 重构：直接订阅缓存，消除 props drilling
    const { data: assets } = useProjectAssets(projectId)
    const characters: Character[] = useMemo(() => assets?.characters ?? [], [assets?.characters])
    const [highlightedCharacterId, setHighlightedCharacterId] = useState<string | null>(null)
    const scrollAnimationRef = useRef<number | null>(null)

    const totalAppearances = characters.reduce((sum, char) => sum + (char.appearances?.length || 0), 0)

    useEffect(() => {
        if (!focusCharacterId) return
        if (!characters.some(character => character.id === focusCharacterId)) return

        const element = document.getElementById(`project-character-${focusCharacterId}`)
        if (!element) return
        const scrollContainer = (element.closest('[data-asset-scroll-container="1"]') ||
            document.querySelector('[data-asset-scroll-container="1"]') ||
            element.closest('.custom-scrollbar')) as HTMLElement | null

        if (scrollAnimationRef.current !== null) {
            window.cancelAnimationFrame(scrollAnimationRef.current)
            scrollAnimationRef.current = null
        }

        if (scrollContainer) {
            const startTop = scrollContainer.scrollTop
            const elementTop = element.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top + scrollContainer.scrollTop
            const targetTop = Math.max(0, elementTop - (scrollContainer.clientHeight - element.clientHeight) / 2)
            const duration = 650
            const startTime = performance.now()
            const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3)

            const animate = (now: number) => {
                const progress = Math.min((now - startTime) / duration, 1)
                const eased = easeOutCubic(progress)
                scrollContainer.scrollTop = startTop + (targetTop - startTop) * eased
                if (progress < 1) {
                    scrollAnimationRef.current = window.requestAnimationFrame(animate)
                } else {
                    scrollAnimationRef.current = null
                }
            }

            scrollAnimationRef.current = window.requestAnimationFrame(animate)
        } else {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }

        setHighlightedCharacterId(focusCharacterId)

        const timer = window.setTimeout(() => {
            setHighlightedCharacterId((current) => (current === focusCharacterId ? null : current))
        }, 2200)

        return () => {
            window.clearTimeout(timer)
            if (scrollAnimationRef.current !== null) {
                window.cancelAnimationFrame(scrollAnimationRef.current)
                scrollAnimationRef.current = null
            }
        }
    }, [characters, focusCharacterId, focusCharacterRequestId])

    return (
        <div className="glass-surface p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)]">
                        <AppIcon name="user" className="h-5 w-5" />
                    </span>
                    <h3 className="text-lg font-bold text-[var(--glass-text-primary)]">{t("stage.characterAssets")}</h3>
                    {isAnalyzingAssets && (
                        <span className="px-2 py-1 text-xs bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)] rounded-lg flex items-center gap-1">
                            <TaskStatusInline state={analyzingAssetsState} />
                        </span>
                    )}
                    <span className="text-sm text-[var(--glass-text-tertiary)] bg-[var(--glass-bg-muted)]/50 px-2 py-1 rounded-lg">
                        {t("stage.counts", { characterCount: characters.length, appearanceCount: totalAppearances })}
                    </span>
                </div>
                <button
                    onClick={onAddCharacter}
                    className="glass-btn-base glass-btn-primary flex items-center gap-2 px-4 py-2 font-medium"
                >
                    + {t("character.add")}
                </button>
            </div>

            {/* 按角色分组显示：外层 grid 让多角色并排 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {characters.map(character => {
                    const appearances = getAppearances(character)
                    const sortedAppearances = [...appearances].sort((a, b) => a.appearanceIndex - b.appearanceIndex)
                    const primaryAppearance = sortedAppearances.find(a => a.appearanceIndex === PRIMARY_APPEARANCE_INDEX) || sortedAppearances[0]

                    const primaryImageUrl = primaryAppearance?.selectedIndex !== null && primaryAppearance?.selectedIndex !== undefined
                        ? (primaryAppearance?.imageUrls?.[primaryAppearance.selectedIndex!] || primaryAppearance?.imageUrl)
                        : (primaryAppearance?.imageUrl || (primaryAppearance?.imageUrls && primaryAppearance.imageUrls.length > 0 ? primaryAppearance.imageUrls[0] : null))
                    const primarySelected = !!primaryImageUrl

                    return (
                        <div
                            key={character.id}
                            id={`project-character-${character.id}`}
                            className={`glass-surface rounded-xl p-4 scroll-mt-24 transition-all duration-700 ${highlightedCharacterId === character.id ? 'ring-2 ring-[var(--glass-focus-ring)] bg-[var(--glass-tone-info-bg)]/40' : ''}`}
                        >
                            {/* 角色标题 */}
                            <div className="flex items-center justify-between border-b border-[var(--glass-stroke-base)] pb-2">
                                <div className="flex items-center gap-3">
                                    <h3 className="text-base font-semibold text-[var(--glass-text-primary)]">{character.name}</h3>
                                    <span className="text-xs text-[var(--glass-text-tertiary)]">
                                        {t("character.assetCount", { count: sortedAppearances.length })}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {/* 从资产中心复制按钮 */}
                                    <button
                                        onClick={() => onCopyFromGlobal(character.id)}
                                        className="text-xs text-[var(--glass-tone-info-fg)] hover:text-[var(--glass-tone-info-fg)] flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[var(--glass-tone-info-bg)] transition-colors"
                                    >
                                        <AppIcon name="copy" className="w-4 h-4" />
                                        {t("character.copyFromGlobal")}
                                    </button>
                                    <button
                                        onClick={() => onDeleteCharacter(character.id)}
                                        className="text-xs text-[var(--glass-tone-danger-fg)] hover:text-[var(--glass-tone-danger-fg)] flex items-center gap-1"
                                    >
                                        <AppIcon name="trash" className="w-4 h-4" />
                                        {t("character.delete")}
                                    </button>
                                </div>
                            </div>

                            {/* 形象网格 */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {sortedAppearances.map(appearance => {
                                    const isPrimary = appearance.appearanceIndex === (primaryAppearance?.appearanceIndex ?? PRIMARY_APPEARANCE_INDEX)
                                    return (
                                        <CharacterCard
                                            key={`${character.id}-${appearance.appearanceIndex}`}
                                            character={character}
                                            appearance={appearance}
                                            onEdit={() => onEditAppearance(character.id, character.name, appearance, character.introduction)}
                                            onDelete={() => onDeleteCharacter(character.id)}
                                            onDeleteAppearance={() => appearance.id && onDeleteAppearance(character.id, appearance.id)}
                                            onRegenerate={() => {
                                                // 获取有效图片数量
                                                const imageUrls = appearance.imageUrls || []
                                                const validImageCount = imageUrls.filter(url => !!url).length

                                                _ulogInfo('[CharacterSection] 重新生成判断:', {
                                                    characterName: character.name,
                                                    appearanceIndex: appearance.appearanceIndex,
                                                    imageUrls,
                                                    validImageCount,
                                                    selectedIndex: appearance.selectedIndex
                                                })

                                                // 单图：重新生成单张
                                                if (validImageCount === 1) {
                                                    const selectedIndex = appearance.selectedIndex ?? 0
                                                    _ulogInfo('[CharacterSection] 调用单张重新生成, imageIndex:', selectedIndex)
                                                    onRegenerateSingle(character.id, appearance.id, selectedIndex)
                                                }
                                                // 多图或无图：重新生成整组
                                                else {
                                                    _ulogInfo('[CharacterSection] 调用整组重新生成')
                                                    onRegenerateGroup(character.id, appearance.id)
                                                }
                                            }}
                                            onGenerate={() => handleGenerateImage('character', character.id, appearance.id)}
                                            onUndo={() => onUndo(character.id, appearance.id)}
                                            onImageClick={onImageClick}
                                            showDeleteButton={true}
                                            appearanceCount={sortedAppearances.length}
                                            onSelectImage={onSelectImage}
                                            activeTaskKeys={activeTaskKeys}
                                            onClearTaskKey={onClearTaskKey}
                                            onImageEdit={(charId, _appearanceId, imageIndex) => onImageEdit(charId, appearance.id, imageIndex, character.name)}
                                            isPrimaryAppearance={isPrimary}
                                            primaryAppearanceSelected={primarySelected}
                                            projectId={projectId}
                                            onConfirmSelection={onConfirmSelection}
                                            onVoiceChange={(characterId: string, customVoiceUrl?: string) => customVoiceUrl && onVoiceChange(characterId, customVoiceUrl)}
                                            onVoiceDesign={onVoiceDesign}
                                            onVoiceSelectFromHub={onVoiceSelectFromHub}
                                        />
                                    )
                                })}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
