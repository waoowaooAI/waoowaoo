'use client'
import { logError as _ulogError } from '@/lib/logging/core'
import { useTranslations } from 'next-intl'

import { useState } from 'react'

interface ScreenplayScene {
    scene_number: number
    heading: {
        int_ext: string
        location: string
        time: string
    } | string
    description?: string
    characters?: string[]
    content: Array<{
        type: 'action' | 'dialogue' | 'voiceover'
        text?: string
        character?: string
        lines?: string
        parenthetical?: string
    }>
}

interface Screenplay {
    clip_id: string
    original_text?: string
    scenes: ScreenplayScene[]
}

interface ScreenplayDisplayProps {
    screenplay: string | null
    originalContent: string
}

export default function ScreenplayDisplay({ screenplay, originalContent }: ScreenplayDisplayProps) {
    const t = useTranslations('storyboard')
    const [activeTab, setActiveTab] = useState<'screenplay' | 'original'>('screenplay')

    // 解析剧本JSON
    let parsedScreenplay: Screenplay | null = null
    try {
        if (screenplay) {
            parsedScreenplay = JSON.parse(screenplay)
        }
    } catch (e) {
        _ulogError('Failed to parse screenplay:', e)
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <button
                    onClick={() => setActiveTab('screenplay')}
                    className={`glass-btn-base rounded-xl px-3 py-1.5 text-sm ${activeTab === 'screenplay'
                        ? 'glass-btn-secondary text-[var(--glass-text-secondary)]'
                        : 'glass-btn-soft'
                        }`}
                >
                    {t('screenplay.tabs.formatted')}
                </button>
                <button
                    onClick={() => setActiveTab('original')}
                    className={`glass-btn-base rounded-xl px-3 py-1.5 text-sm ${activeTab === 'original'
                        ? 'glass-btn-secondary text-[var(--glass-text-secondary)]'
                        : 'glass-btn-soft'
                        }`}
                >
                    {t('screenplay.tabs.original')}
                </button>
            </div>

            <div className="glass-surface-soft p-4 max-h-96 overflow-y-auto">
                {activeTab === 'screenplay' && parsedScreenplay ? (
                    <div className="space-y-3">
                        {parsedScreenplay.scenes.map((scene, sceneIndex) => (
                            <div key={sceneIndex} className="border-l-2 border-[var(--glass-stroke-focus)] pl-3 space-y-2">
                                <div className="flex items-center gap-2 text-xs flex-wrap">
                                    <span className="font-bold text-[var(--glass-tone-info-fg)] bg-[var(--glass-tone-info-bg)] px-2 py-0.5 rounded">
                                        {t('screenplay.scene', { number: scene.scene_number })}
                                    </span>
                                    <span className="text-[var(--glass-text-tertiary)]">
                                        {typeof scene.heading === 'string'
                                            ? scene.heading
                                            : `${scene.heading.int_ext} · ${scene.heading.location} · ${scene.heading.time}`}
                                    </span>
                                </div>

                                {scene.description && (
                                    <div className="text-xs text-[var(--glass-text-tertiary)] italic bg-[var(--glass-bg-muted)]/70 px-2 py-1 rounded">
                                        {scene.description}
                                    </div>
                                )}

                                {scene.characters && scene.characters.length > 0 && (
                                    <div className="flex gap-1 flex-wrap items-center">
                                        <span className="text-[10px] text-[var(--glass-text-tertiary)]">{t('screenplay.characters')}</span>
                                        {scene.characters.map((name, index) => (
                                            <span key={`${name}-${index}`} className="text-[10px] text-[var(--glass-text-secondary)] bg-[var(--glass-bg-muted)] px-1.5 py-0.5 rounded">
                                                {name}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    {scene.content.map((item, itemIndex) => (
                                        <div key={itemIndex}>
                                            {item.type === 'action' && (
                                                <p className="text-sm text-[var(--glass-text-secondary)] leading-relaxed">{item.text}</p>
                                            )}
                                            {item.type === 'dialogue' && (
                                                <div className="bg-[var(--glass-tone-warning-bg)]/60 border-l-2 border-[var(--glass-stroke-warning)] pl-2 py-1">
                                                    <div>
                                                        <span className="text-xs font-medium text-[var(--glass-tone-warning-fg)]">{item.character}</span>
                                                        {item.parenthetical && (
                                                            <span className="text-[var(--glass-tone-warning-fg)] ml-1">({item.parenthetical})</span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-[var(--glass-text-secondary)]">
                                                        <span className="select-none text-[var(--glass-text-tertiary)]">&quot;</span>
                                                        {item.lines}
                                                        <span className="select-none text-[var(--glass-text-tertiary)]">&quot;</span>
                                                    </p>
                                                </div>
                                            )}
                                            {item.type === 'voiceover' && (
                                                <div className="bg-[var(--glass-tone-info-bg)]/60 border-l-2 border-[var(--glass-stroke-focus)] pl-2 py-1">
                                                    <span className="text-xs text-[var(--glass-tone-info-fg)]">{t('screenplay.voiceover')}</span>
                                                    <p className="text-sm text-[var(--glass-text-secondary)] italic">{item.text}</p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : activeTab === 'screenplay' && !parsedScreenplay ? (
                    <div className="text-center text-[var(--glass-text-tertiary)] py-8">
                        <p>{t('screenplay.parseFailedTitle')}</p>
                        <p className="text-xs mt-1">{t('screenplay.parseFailedDescription')}</p>
                    </div>
                ) : (
                    <div className="text-sm text-[var(--glass-text-secondary)] whitespace-pre-wrap leading-relaxed">{originalContent}</div>
                )}
            </div>
        </div>
    )
}
