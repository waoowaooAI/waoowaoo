'use client'
import { logError as _ulogError } from '@/lib/logging/core'
import { useTranslations } from 'next-intl'

import React, { useEffect, useState } from 'react'
import { AppIcon } from '@/components/ui/icons'
import { useEditorState } from '../hooks/useEditorState'
import { useEditorActions } from '../hooks/useEditorActions'
import { VideoEditorProject } from '../types/editor.types'
import { calculateTimelineDuration, framesToTime } from '../utils/time-utils'
import { RemotionPreview } from './Preview'
import { Timeline } from './Timeline'
import { TransitionPicker, TransitionType } from './TransitionPicker'

interface VideoEditorStageProps {
    projectId: string
    episodeId: string
    initialProject?: VideoEditorProject
    onBack?: () => void
}

/**
 * 视频编辑器主页面
 * 
 * 布局:
 * ┌──────────────────────────────────────────────────────────┐
 * │ Toolbar (返回 | 保存 | 导出)                              │
 * ├──────────────┬───────────────────────────────────────────┤
 * │  素材库       │       Preview (Remotion Player)           │
 * │              │                                           │
 * │              ├───────────────────────────────────────────┤
 * │              │       Properties Panel                    │
 * ├──────────────┴───────────────────────────────────────────┤
 * │                      Timeline                            │
 * └──────────────────────────────────────────────────────────┘
 */
export function VideoEditorStage({
    projectId,
    episodeId,
    initialProject,
    onBack
}: VideoEditorStageProps) {
    const t = useTranslations('video')
    const {
        project,
        timelineState,
        isDirty,
        removeClip,
        updateClip,
        reorderClips,
        play,
        pause,
        seek,
        selectClip,
        setZoom,
        markSaved
    } = useEditorState({ episodeId, initialProject })

    const { saveProject, startRender } = useEditorActions({ projectId, episodeId })

    const totalDuration = calculateTimelineDuration(project.timeline)
    const totalTime = framesToTime(totalDuration, project.config.fps)
    const currentTime = framesToTime(timelineState.currentFrame, project.config.fps)

    const handleSave = async () => {
        try {
            await saveProject(project)
            markSaved()
            alert(t('editor.alert.saveSuccess'))
        } catch (error) {
            _ulogError('Save failed:', error)
            alert(t('editor.alert.saveFailed'))
        }
    }

    const handleExport = async () => {
        try {
            await startRender(project.id)
            alert(t('editor.alert.exportStarted'))
        } catch (error) {
            _ulogError('Export failed:', error)
            alert(t('editor.alert.exportFailed'))
        }
    }

    const selectedClip = project.timeline.find(c => c.id === timelineState.selectedClipId)
    const selectedClipId = selectedClip?.id || null
    const selectedClipTrimFrom = selectedClip?.trim?.from || 0
    const selectedClipTrimTo = selectedClip?.trim?.to || selectedClip?.durationInFrames || 0
    const [trimFromInput, setTrimFromInput] = useState(0)
    const [trimToInput, setTrimToInput] = useState(0)

    useEffect(() => {
        if (!selectedClipId) return
        setTrimFromInput(selectedClipTrimFrom)
        setTrimToInput(selectedClipTrimTo)
    }, [selectedClipId, selectedClipTrimFrom, selectedClipTrimTo])

    const applyTrim = () => {
        if (!selectedClip) return
        const safeFrom = Math.max(0, Math.floor(trimFromInput))
        const safeTo = Math.max(safeFrom + 1, Math.floor(trimToInput))
        updateClip(selectedClip.id, {
            trim: {
                from: safeFrom,
                to: safeTo
            },
            durationInFrames: safeTo - safeFrom
        })
    }

    const clearTrim = () => {
        if (!selectedClip) return
        updateClip(selectedClip.id, {
            trim: undefined
        })
    }

    return (
        <div className="video-editor-stage" style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            background: 'var(--background)',
            color: 'var(--foreground)'
        }}>
            {/* Toolbar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--card)'
            }}>
                <button
                    onClick={onBack}
                    className="inline-flex items-center justify-center border border-input bg-background hover:bg-accent hover:text-accent-foreground px-4 py-2"
                >
                    {t('editor.toolbar.back')}
                </button>

                <div style={{ flex: 1 }} />

                <span style={{ color: 'var(--muted-foreground)', fontSize: '14px' }}>
                    {currentTime} / {totalTime}
                </span>

                <button
                    onClick={handleSave}
                    className={`inline-flex items-center justify-center px-4 py-2 ${isDirty ? 'bg-primary text-primary-foreground hover:bg-primary/90 text-white' : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'}`}
                >
                    {isDirty ? t('editor.toolbar.saveDirty') : t('editor.toolbar.saved')}
                </button>

                <button
                    onClick={handleExport}
                    className="inline-flex items-center justify-center bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-4 py-2"
                >
                    {t('editor.toolbar.export')}
                </button>
            </div>

            {/* Main Content */}
            <div style={{
                display: 'flex',
                flex: 1,
                overflow: 'hidden'
            }}>
                {/* Left Panel - Media Library */}
                <div style={{
                    width: '200px',
                    borderRight: '1px solid var(--border)',
                    padding: '12px',
                    background: 'var(--muted)'
                }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--muted-foreground)' }}>
                        {t('editor.left.title')}
                    </h3>
                    <p style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>
                        {t('editor.left.description')}
                    </p>
                </div>

                {/* Center - Preview + Properties */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    {/* Preview */}
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'var(--muted)',
                        padding: '20px'
                    }}>
                        <RemotionPreview
                            project={project}
                            currentFrame={timelineState.currentFrame}
                            playing={timelineState.playing}
                            onFrameChange={seek}
                            onPlayingChange={(playing) => playing ? play() : pause()}
                        />
                    </div>

                    {/* Playback Controls */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '16px',
                        padding: '12px',
                        background: 'var(--muted)',
                        borderTop: '1px solid var(--border)'
                    }}>
                        <button
                            onClick={() => seek(0)}
                            className="inline-flex items-center justify-center bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground px-3 py-1.5"
                        >
                            <AppIcon name="chevronLeft" className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => timelineState.playing ? pause() : play()}
                            style={{
                                background: 'var(--primary)',
                                border: 'none',
                                color: 'var(--primary-foreground)',
                                cursor: 'pointer',
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                fontSize: '18px'
                            }}
                        >
                            {timelineState.playing
                                ? <AppIcon name="pause" className="w-4 h-4" />
                                : <AppIcon name="play" className="w-4 h-4" />}
                        </button>
                        <button
                            onClick={() => seek(totalDuration)}
                            className="inline-flex items-center justify-center bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground px-3 py-1.5"
                        >
                            <AppIcon name="chevronRight" className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Right Panel - Properties */}
                <div style={{
                    width: '280px',
                    borderLeft: '1px solid var(--border)',
                    padding: '12px',
                    background: 'var(--muted)',
                    overflowY: 'auto'
                }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--muted-foreground)' }}>
                        {t('editor.right.title')}
                    </h3>
                    {selectedClip ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* 基础信息 */}
                            <div style={{ fontSize: '12px' }}>
                                <p style={{ margin: '0 0 8px 0' }}>
                                    <span style={{ color: 'var(--muted-foreground)' }}>{t('editor.right.clipLabel')}</span> {selectedClip.metadata?.description || t('editor.right.clipFallback', { index: project.timeline.findIndex(c => c.id === selectedClip.id) + 1 })}
                                </p>
                                <p style={{ margin: '0 0 8px 0' }}>
                                    <span style={{ color: 'var(--muted-foreground)' }}>{t('editor.right.durationLabel')}</span> {framesToTime(selectedClip.durationInFrames, project.config.fps)}
                                </p>
                            </div>

                            {/* 转场设置 */}
                            <div>
                                <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--muted-foreground)' }}>
                                    {t('editor.right.transitionLabel')}
                                </h4>
                                <TransitionPicker
                                    value={(selectedClip.transition?.type as TransitionType) || 'none'}
                                    duration={selectedClip.transition?.durationInFrames || 15}
                                    onChange={(type, duration) => {
                                        updateClip(selectedClip.id, {
                                            transition: type === 'none' ? undefined : { type, durationInFrames: duration }
                                        })
                                    }}
                                />
                            </div>

                            <div>
                                <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--muted-foreground)' }}>
                                    Trim
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                                        <span style={{ color: 'var(--muted-foreground)' }}>From (frame)</span>
                                        <input
                                            type="number"
                                            min={0}
                                            value={trimFromInput}
                                            onChange={(event) => setTrimFromInput(Number(event.target.value || 0))}
                                            className="border border-input bg-background px-2 py-1 text-xs"
                                        />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                                        <span style={{ color: 'var(--muted-foreground)' }}>To (frame)</span>
                                        <input
                                            type="number"
                                            min={1}
                                            value={trimToInput}
                                            onChange={(event) => setTrimToInput(Number(event.target.value || 1))}
                                            className="border border-input bg-background px-2 py-1 text-xs"
                                        />
                                    </label>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                    <button
                                        onClick={applyTrim}
                                        className="inline-flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 text-xs"
                                    >
                                        Apply
                                    </button>
                                    <button
                                        onClick={clearTrim}
                                        className="inline-flex items-center justify-center border border-input bg-background hover:bg-accent hover:text-accent-foreground px-3 py-1.5 text-xs"
                                    >
                                        Clear
                                    </button>
                                </div>
                            </div>

                            {/* 删除按钮 */}
                            <button
                                onClick={() => {
                                    if (confirm(t('editor.right.deleteConfirm'))) {
                                        removeClip(selectedClip.id)
                                        selectClip(null)
                                    }
                                }}
                                className="inline-flex items-center justify-center bg-destructive/10 text-destructive hover:bg-destructive/20 mt-2 px-3 py-2 text-xs"
                            >
                                {t('editor.right.deleteClip')}
                            </button>
                        </div>
                    ) : (
                        <p style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>
                            {t('editor.right.selectClipHint')}
                        </p>
                    )}
                </div>
            </div>

            {/* Timeline */}
            <div style={{
                height: '220px',
                borderTop: '1px solid var(--border)'
            }}>
                <Timeline
                    clips={project.timeline}
                    timelineState={timelineState}
                    config={project.config}
                    onReorder={reorderClips}
                    onSelectClip={selectClip}
                    onZoomChange={setZoom}
                    onSeek={seek}
                />
            </div>
        </div>
    )
}

export default VideoEditorStage
