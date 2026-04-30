'use client'
import { logError as _ulogError } from '@/lib/logging/core'
import { useTranslations } from 'next-intl'

import { useEffect, useMemo, useState } from 'react'

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
    onSaveScreenplay?: (screenplay: string) => Promise<void>
}

function cloneScreenplay(screenplay: Screenplay): Screenplay {
    return JSON.parse(JSON.stringify(screenplay)) as Screenplay
}

function EditableScreenplayText({
    value,
    title,
    multiline = true,
    className = '',
    onSave,
}: {
    value: string
    title: string
    multiline?: boolean
    className?: string
    onSave: (nextValue: string) => Promise<void>
}) {
    const t = useTranslations('storyboard')
    const [isEditing, setIsEditing] = useState(false)
    const [draft, setDraft] = useState(value)
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
        if (!isEditing) setDraft(value)
    }, [isEditing, value])

    const handleSave = async () => {
        if (draft === value) {
            setIsEditing(false)
            return
        }
        setIsSaving(true)
        try {
            await onSave(draft)
            setIsEditing(false)
        } finally {
            setIsSaving(false)
        }
    }

    if (isEditing) {
        return (
            <div className="space-y-1">
                <textarea
                    autoFocus
                    value={draft}
                    rows={multiline ? 3 : 1}
                    onChange={(event) => setDraft(event.target.value)}
                    className={`w-full rounded border border-[var(--glass-stroke-focus)] bg-[var(--glass-bg-surface)] px-2 py-1 text-sm text-[var(--glass-text-secondary)] outline-none ${multiline ? 'resize-y' : 'resize-none'} ${className}`}
                />
                <div className="flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            setDraft(value)
                            setIsEditing(false)
                        }}
                        disabled={isSaving}
                        className="glass-btn-base glass-btn-soft rounded px-2 py-1 text-xs disabled:opacity-50"
                    >
                        {t('screenplay.cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={() => { void handleSave() }}
                        disabled={isSaving}
                        className="glass-btn-base glass-btn-primary rounded px-2 py-1 text-xs disabled:opacity-50"
                    >
                        {isSaving ? t('screenplay.saving') : t('screenplay.save')}
                    </button>
                </div>
            </div>
        )
    }

    return (
        <button
            type="button"
            onClick={() => setIsEditing(true)}
            className={`block w-full rounded border border-transparent px-1 py-0.5 text-left transition-colors hover:border-[var(--glass-stroke-focus)] hover:bg-[var(--glass-tone-info-bg)] ${className}`}
            title={title}
        >
            {value || <span className="italic text-[var(--glass-text-tertiary)]">{t('screenplay.emptyEditable')}</span>}
        </button>
    )
}

export default function ScreenplayDisplay({ screenplay, originalContent, onSaveScreenplay }: ScreenplayDisplayProps) {
    const t = useTranslations('storyboard')
    const [activeTab, setActiveTab] = useState<'screenplay' | 'original'>('screenplay')
    const [localScreenplay, setLocalScreenplay] = useState(screenplay)

    useEffect(() => {
        setLocalScreenplay(screenplay)
    }, [screenplay])

    // 解析剧本JSON
    const parsedScreenplay = useMemo(() => {
        try {
            if (localScreenplay) {
                return JSON.parse(localScreenplay) as Screenplay
            }
        } catch (e) {
            _ulogError('Failed to parse screenplay:', e)
        }
        return null
    }, [localScreenplay])

    const handleUpdateScreenplay = async (mutate: (nextScreenplay: Screenplay) => void) => {
        if (!parsedScreenplay || !onSaveScreenplay) return
        const previous = localScreenplay
        const nextScreenplay = cloneScreenplay(parsedScreenplay)
        mutate(nextScreenplay)
        const nextSerialized = JSON.stringify(nextScreenplay)
        setLocalScreenplay(nextSerialized)
        try {
            await onSaveScreenplay(nextSerialized)
        } catch (error) {
            setLocalScreenplay(previous)
            _ulogError('Failed to save screenplay:', error)
            alert(t('screenplay.saveFailed'))
            throw error
        }
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
                                    {typeof scene.heading === 'string' ? (
                                        <span className="text-[var(--glass-text-tertiary)]">{scene.heading}</span>
                                    ) : (
                                        <span className="flex flex-wrap items-center gap-1 text-[var(--glass-text-tertiary)]">
                                            <span>{scene.heading.int_ext}</span>
                                            <span>·</span>
                                            {onSaveScreenplay ? (
                                                <EditableScreenplayText
                                                    value={scene.heading.location || ''}
                                                    title={t('screenplay.clickToEdit')}
                                                    multiline={false}
                                                    className="inline-block w-auto min-w-16 text-xs"
                                                    onSave={(nextValue) => handleUpdateScreenplay((nextScreenplay) => {
                                                        const nextScene = nextScreenplay.scenes[sceneIndex]
                                                        if (nextScene && typeof nextScene.heading !== 'string') nextScene.heading.location = nextValue
                                                    })}
                                                />
                                            ) : (
                                                <span>{scene.heading.location}</span>
                                            )}
                                            <span>·</span>
                                            {onSaveScreenplay ? (
                                                <EditableScreenplayText
                                                    value={scene.heading.time || ''}
                                                    title={t('screenplay.clickToEdit')}
                                                    multiline={false}
                                                    className="inline-block w-auto min-w-12 text-xs"
                                                    onSave={(nextValue) => handleUpdateScreenplay((nextScreenplay) => {
                                                        const nextScene = nextScreenplay.scenes[sceneIndex]
                                                        if (nextScene && typeof nextScene.heading !== 'string') nextScene.heading.time = nextValue
                                                    })}
                                                />
                                            ) : (
                                                <span>{scene.heading.time}</span>
                                            )}
                                        </span>
                                    )}
                                </div>

                                {scene.description && (
                                    <div className="text-xs text-[var(--glass-text-tertiary)] italic bg-[var(--glass-bg-muted)]/70 px-2 py-1 rounded">
                                        {onSaveScreenplay ? (
                                            <EditableScreenplayText
                                                value={scene.description}
                                                title={t('screenplay.clickToEdit')}
                                                onSave={(nextValue) => handleUpdateScreenplay((nextScreenplay) => {
                                                    nextScreenplay.scenes[sceneIndex].description = nextValue
                                                })}
                                            />
                                        ) : scene.description}
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
                                                <div className="text-sm text-[var(--glass-text-secondary)] leading-relaxed">
                                                    {onSaveScreenplay ? (
                                                        <EditableScreenplayText
                                                            value={item.text || ''}
                                                            title={t('screenplay.clickToEdit')}
                                                            onSave={(nextValue) => handleUpdateScreenplay((nextScreenplay) => {
                                                                nextScreenplay.scenes[sceneIndex].content[itemIndex].text = nextValue
                                                            })}
                                                        />
                                                    ) : item.text}
                                                </div>
                                            )}
                                            {item.type === 'dialogue' && (
                                                <div className="bg-[var(--glass-tone-warning-bg)]/60 border-l-2 border-[var(--glass-stroke-warning)] pl-2 py-1">
                                                    <div>
                                                        <span className="text-xs font-medium text-[var(--glass-tone-warning-fg)]">{item.character}</span>
                                                        {item.parenthetical && (
                                                            <span className="text-[var(--glass-tone-warning-fg)] ml-1">({item.parenthetical})</span>
                                                        )}
                                                    </div>
                                                    <div className="text-sm text-[var(--glass-text-secondary)]">
                                                        <span className="select-none text-[var(--glass-text-tertiary)]">&quot;</span>
                                                        {onSaveScreenplay ? (
                                                            <EditableScreenplayText
                                                                value={item.lines || ''}
                                                                title={t('screenplay.clickToEdit')}
                                                                className="inline-block w-[calc(100%-1rem)]"
                                                                onSave={(nextValue) => handleUpdateScreenplay((nextScreenplay) => {
                                                                    nextScreenplay.scenes[sceneIndex].content[itemIndex].lines = nextValue
                                                                })}
                                                            />
                                                        ) : item.lines}
                                                        <span className="select-none text-[var(--glass-text-tertiary)]">&quot;</span>
                                                    </div>
                                                </div>
                                            )}
                                            {item.type === 'voiceover' && (
                                                <div className="bg-[var(--glass-tone-info-bg)]/60 border-l-2 border-[var(--glass-stroke-focus)] pl-2 py-1">
                                                    <div className="mb-1 flex flex-wrap items-center gap-2">
                                                        <span className="text-xs text-[var(--glass-tone-info-fg)]">{t('screenplay.voiceover')}</span>
                                                        {onSaveScreenplay && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    void handleUpdateScreenplay((nextScreenplay) => {
                                                                        const nextItem = nextScreenplay.scenes[sceneIndex].content[itemIndex]
                                                                        nextItem.type = 'action'
                                                                        nextItem.text = nextItem.text || item.text || ''
                                                                        delete nextItem.character
                                                                        delete nextItem.lines
                                                                        delete nextItem.parenthetical
                                                                    })
                                                                }}
                                                                className="glass-btn-base glass-btn-soft rounded px-2 py-0.5 text-[10px]"
                                                            >
                                                                {t('screenplay.convertToAction')}
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="text-sm text-[var(--glass-text-secondary)] italic">
                                                        {onSaveScreenplay ? (
                                                            <EditableScreenplayText
                                                                value={item.text || ''}
                                                                title={t('screenplay.clickToEdit')}
                                                                onSave={(nextValue) => handleUpdateScreenplay((nextScreenplay) => {
                                                                    nextScreenplay.scenes[sceneIndex].content[itemIndex].text = nextValue
                                                                })}
                                                            />
                                                        ) : item.text}
                                                    </div>
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
