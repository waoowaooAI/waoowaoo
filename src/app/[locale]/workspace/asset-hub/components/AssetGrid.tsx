'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { CharacterCard } from './CharacterCard'
import { LocationCard } from './LocationCard'
import { VoiceCard } from './VoiceCard'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { AppIcon } from '@/components/ui/icons'

interface Character {
    id: string
    name: string
    folderId: string | null
    customVoiceUrl: string | null
    appearances: Array<{
        id: string
        appearanceIndex: number
        changeReason: string
        description: string | null
        imageUrl: string | null
        imageUrls: string[]
        selectedIndex: number | null
        effectiveSelectedIndex?: number | null
        previousImageUrl: string | null
        previousImageUrls: string[]
        imageTaskRunning: boolean
    }>
}

interface Location {
    id: string
    name: string
    summary: string | null
    folderId: string | null
    images: Array<{
        id: string
        imageIndex: number
        description: string | null
        imageUrl: string | null
        previousImageUrl: string | null
        isSelected: boolean
        imageTaskRunning: boolean
    }>
}

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

interface AssetGridProps {
    characters: Character[]
    locations: Location[]
    voices: Voice[]
    loading: boolean
    onAddCharacter: () => void
    onAddLocation: () => void
    onAddVoice: () => void
    selectedFolderId: string | null
    onImageClick?: (url: string) => void
    onImageEdit?: (type: 'character' | 'location', id: string, name: string, imageIndex: number, appearanceIndex?: number) => void
    onVoiceDesign?: (characterId: string, characterName: string) => void
    onCharacterEdit?: (character: unknown, appearance: unknown) => void
    onLocationEdit?: (location: unknown, imageIndex: number) => void
    onVoiceSelect?: (characterId: string) => void
}

// 内联 SVG 图标
const PlusIcon = ({ className }: { className?: string }) => (
    <AppIcon name="plus" className={className} />
)

export function AssetGrid({
    characters,
    locations,
    voices,
    loading,
    onAddCharacter,
    onAddLocation,
    onAddVoice,
    selectedFolderId: _selectedFolderId,
    onImageClick,
    onImageEdit,
    onVoiceDesign,
    onCharacterEdit,
    onLocationEdit,
    onVoiceSelect
}: AssetGridProps) {
    const t = useTranslations('assetHub')
    const loadingState = loading
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'generate',
            resource: 'image',
            hasOutput: false,
        })
        : null
    void _selectedFolderId

    const [filter, setFilter] = useState<'all' | 'character' | 'location' | 'voice'>('all')
    const [sectionPage, setSectionPage] = useState<{ character: number; location: number; voice: number }>({
        character: 1,
        location: 1,
        voice: 1,
    })

    const pageSize = 40
    const paginate = <T,>(rows: T[], page: number) => {
        const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
        const safePage = Math.min(Math.max(page, 1), totalPages)
        const start = (safePage - 1) * pageSize
        return {
            items: rows.slice(start, start + pageSize),
            page: safePage,
            totalPages,
        }
    }

    const setPage = (type: 'character' | 'location' | 'voice', page: number) => {
        setSectionPage((prev) => ({ ...prev, [type]: page }))
    }

    const charactersPage = paginate(characters, sectionPage.character)
    const locationsPage = paginate(locations, sectionPage.location)
    const voicesPage = paginate(voices, sectionPage.voice)

    const renderPagination = (type: 'character' | 'location' | 'voice', page: number, totalPages: number) => {
        if (totalPages <= 1) return null
        return (
            <div className="mt-4 flex items-center justify-end gap-2">
                <button
                    onClick={() => setPage(type, page - 1)}
                    disabled={page <= 1}
                    className="glass-btn-base glass-btn-secondary px-3 py-1.5 text-xs rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {t('pagination.previous')}
                </button>
                <span className="text-xs text-[var(--glass-text-tertiary)]">
                    {page} / {totalPages}
                </span>
                <button
                    onClick={() => setPage(type, page + 1)}
                    disabled={page >= totalPages}
                    className="glass-btn-base glass-btn-secondary px-3 py-1.5 text-xs rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {t('pagination.next')}
                </button>
            </div>
        )
    }

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center py-20">
                <TaskStatusInline state={loadingState} />
            </div>
        )
    }

    const isEmpty = characters.length === 0 && locations.length === 0 && voices.length === 0

    const tabs = [
        { id: 'all', label: t('allAssets') },
        { id: 'character', label: t('characters') },
        { id: 'location', label: t('locations') },
        { id: 'voice', label: t('voices') },
    ]

    return (
        <div className="flex-1 min-w-0">
            {/* Header: 筛选 Tab + 操作按钮 */}
            <div className="flex items-center justify-between mb-6">
                {/* 左侧筛选 */}
                {(() => {
                    const tabIds = tabs.map(t => t.id)
                    const activeIdx = tabIds.indexOf(filter)
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
                                        onClick={() => setFilter(tab.id as 'all' | 'character' | 'location' | 'voice')}
                                        className={`relative z-[1] px-4 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${filter === tab.id ? 'text-[var(--glass-text-primary)] font-medium' : 'text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)]'}`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )
                })()}

                {/* 右侧新建按钮 */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={onAddCharacter}
                        className="glass-btn-base glass-btn-primary px-4 py-2 rounded-lg text-sm"
                    >
                        <PlusIcon className="w-4 h-4" />
                        <span>{t('addCharacter')}</span>
                    </button>
                    <button
                        onClick={onAddLocation}
                        className="glass-btn-base glass-btn-primary px-4 py-2 rounded-lg text-sm"
                    >
                        <PlusIcon className="w-4 h-4" />
                        <span>{t('addLocation')}</span>
                    </button>
                    <button
                        onClick={onAddVoice}
                        className="glass-btn-base glass-btn-tone-info px-4 py-2 rounded-lg text-sm"
                    >
                        <PlusIcon className="w-4 h-4" />
                        <span>{t('addVoice')}</span>
                    </button>
                </div>
            </div>

            {isEmpty ? (
                /* 空状态 */
                <div className="glass-surface rounded-xl p-12 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--glass-bg-muted)] flex items-center justify-center">
                        <PlusIcon className="w-8 h-8 text-[var(--glass-text-tertiary)]" />
                    </div>
                    <p className="text-[var(--glass-text-secondary)] mb-2">{t('emptyState')}</p>
                    <p className="text-sm text-[var(--glass-text-tertiary)]">{t('emptyStateHint')}</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {/* 角色区块 */}
                    {(filter === 'all' || filter === 'character') && characters.length > 0 && (
                        <section>
                            <h2 className="text-sm font-semibold text-[var(--glass-text-primary)] mb-3 flex items-center gap-2">
                                {t('characters')}
                                <span className="glass-chip glass-chip-neutral px-2 py-0.5">{characters.length}</span>
                            </h2>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                {charactersPage.items.map((character) => (
                                    <CharacterCard
                                        key={character.id}
                                        character={character}
                                        onImageClick={onImageClick}
                                        onImageEdit={onImageEdit}
                                        onVoiceDesign={onVoiceDesign}
                                        onEdit={onCharacterEdit}
                                        onVoiceSelect={onVoiceSelect}
                                    />
                                ))}
                            </div>
                            {renderPagination('character', charactersPage.page, charactersPage.totalPages)}
                        </section>
                    )}

                    {/* 场景区块 */}
                    {(filter === 'all' || filter === 'location') && locations.length > 0 && (
                        <section>
                            <h2 className="text-sm font-semibold text-[var(--glass-text-primary)] mb-3 flex items-center gap-2">
                                {t('locations')}
                                <span className="glass-chip glass-chip-neutral px-2 py-0.5">{locations.length}</span>
                            </h2>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {locationsPage.items.map((location) => (
                                    <LocationCard
                                        key={location.id}
                                        location={location}
                                        onImageClick={onImageClick}
                                        onImageEdit={onImageEdit}
                                        onEdit={onLocationEdit}
                                    />
                                ))}
                            </div>
                            {renderPagination('location', locationsPage.page, locationsPage.totalPages)}
                        </section>
                    )}

                    {/* 音色区块 */}
                    {(filter === 'all' || filter === 'voice') && voices.length > 0 && (
                        <section>
                            <h2 className="text-sm font-semibold text-[var(--glass-text-primary)] mb-3 flex items-center gap-2">
                                {t('voices')}
                                <span className="glass-chip glass-chip-info px-2 py-0.5">{voices.length}</span>
                            </h2>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                {voicesPage.items.map((voice) => (
                                    <VoiceCard
                                        key={voice.id}
                                        voice={voice}
                                    />
                                ))}
                            </div>
                            {renderPagination('voice', voicesPage.page, voicesPage.totalPages)}
                        </section>
                    )}
                </div>
            )}
        </div>
    )
}
