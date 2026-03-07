'use client'
import { logError as _ulogError } from '@/lib/logging/core'
import { useTranslations } from 'next-intl'

import { useState, useRef, useEffect } from 'react'
import { AppIcon } from '@/components/ui/icons'

interface Episode {
    id: string
    episodeNumber: number
    name: string
    description?: string | null
}

interface SidebarProps {
    projectId: string
    projectName: string
    episodes: Episode[]
    currentEpisodeId: string | null
    onEpisodeSelect: (id: string) => void
    onEpisodeCreate: (name: string, description?: string) => Promise<void>
    onEpisodeDelete: (id: string) => Promise<void>
    onEpisodeRename: (id: string, newName: string) => Promise<void>
    onGlobalAssetsClick: () => void
    isGlobalAssetsView: boolean
}

export default function Sidebar({
    projectId,
    projectName,
    episodes,
    currentEpisodeId,
    onEpisodeSelect,
    onEpisodeCreate,
    onEpisodeDelete,
    onEpisodeRename,
    onGlobalAssetsClick,
    isGlobalAssetsView
}: SidebarProps) {
    const t = useTranslations('workspaceDetail')
    const [isExpanded, setIsExpanded] = useState(false)
    void projectId
    const [isCreating, setIsCreating] = useState(false)
    const [newEpisodeName, setNewEpisodeName] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editingName, setEditingName] = useState('')
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

    // 可拖动位置
    const [position, setPosition] = useState({ y: 200 }) // 初始Y位置
    const [isDragging, setIsDragging] = useState(false)
    const dragStartY = useRef(0)
    const dragStartPos = useRef(0)

    // 拖动逻辑
    const handleDragStart = (e: React.MouseEvent) => {
        e.preventDefault()
        setIsDragging(true)
        dragStartY.current = e.clientY
        dragStartPos.current = position.y
    }

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return
            const deltaY = e.clientY - dragStartY.current
            const newY = Math.max(100, Math.min(window.innerHeight - 200, dragStartPos.current + deltaY))
            setPosition({ y: newY })
        }

        const handleMouseUp = () => {
            setIsDragging(false)
        }

        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove)
            document.addEventListener('mouseup', handleMouseUp)
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
        }
    }, [isDragging])

    // 创建剧集
    const handleCreate = async () => {
        if (!newEpisodeName.trim()) return
        try {
            await onEpisodeCreate(newEpisodeName.trim())
            setNewEpisodeName('')
            setIsCreating(false)
        } catch (err) {
            _ulogError('创建剧集失败:', err)
        }
    }

    // 重命名剧集
    const handleRename = async (id: string) => {
        if (!editingName.trim()) return
        try {
            await onEpisodeRename(id, editingName.trim())
            setEditingId(null)
            setEditingName('')
        } catch (err) {
            _ulogError('重命名失败:', err)
        }
    }

    // 删除剧集
    const handleDelete = async (id: string) => {
        try {
            await onEpisodeDelete(id)
            setDeleteConfirmId(null)
        } catch (err) {
            _ulogError('删除失败:', err)
        }
    }

    return (
        <>
            {/* 触发条 - 固定在左侧，可拖动 */}
            <div
                className="fixed left-0 z-50"
                style={{ top: position.y }}
            >
                {/* 拖动手柄 + 触发按钮 */}
                <div className="flex flex-col items-center">
                    {/* 拖动手柄 */}
                    <div
                        className="w-6 h-4 bg-[var(--glass-bg-muted)] rounded-t cursor-ns-resize flex items-center justify-center hover:bg-[var(--glass-bg-surface-strong)] transition-colors"
                        onMouseDown={handleDragStart}
                        title={t('sidebar.dragToMove')}
                    >
                        <div className="flex gap-0.5">
                            <div className="w-0.5 h-1.5 bg-[var(--glass-text-tertiary)] rounded-full" />
                            <div className="w-0.5 h-1.5 bg-[var(--glass-text-tertiary)] rounded-full" />
                            <div className="w-0.5 h-1.5 bg-[var(--glass-text-tertiary)] rounded-full" />
                        </div>
                    </div>

                    {/* 展开按钮 */}
                    <div
                        className={`glass-surface rounded-r-xl cursor-pointer transition-all flex items-center gap-1 px-2 py-3 ${isExpanded ? 'bg-[var(--glass-tone-info-bg)] border-[var(--glass-stroke-focus)]' : ''
                            }`}
                        onClick={() => setIsExpanded(!isExpanded)}
                    >
                        <AppIcon name="chevronRight" className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180 text-[var(--glass-tone-info-fg)]' : 'text-[var(--glass-text-tertiary)]'}`} />
                        <span className={`text-xs font-medium whitespace-nowrap ${isExpanded ? 'text-[var(--glass-tone-info-fg)]' : 'text-[var(--glass-text-secondary)]'}`}>
                            {t('episode')}
                        </span>
                    </div>
                </div>
            </div>

            {/* 弹出面板 */}
            {isExpanded && (
                <>
                    {/* 背景遮罩 */}
                    <div
                        className="fixed inset-0 glass-overlay z-40"
                        onClick={() => setIsExpanded(false)}
                    />

                    {/* 侧边面板 */}
                    <div
                        className="fixed left-12 glass-surface-modal rounded-r-xl z-50 w-64 max-h-[70vh] overflow-hidden flex flex-col"
                        style={{ top: position.y - 50 }}
                    >
                        {/* 标题栏 */}
                        <div className="p-4 border-b border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)]">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="font-bold text-[var(--glass-text-primary)] text-sm flex items-center gap-1.5">
                                        <AppIcon name="monitor" className="w-4 h-4 text-[var(--glass-tone-info-fg)]" />
                                        <span>{t('sidebar.listTitle')}</span>
                                    </h3>
                                    <p className="text-xs text-[var(--glass-text-secondary)] mt-0.5 truncate" title={projectName}>
                                        {projectName}
                                    </p>
                                </div>
                                <span className="text-xs text-[var(--glass-text-tertiary)] bg-[var(--glass-bg-muted)] px-2 py-0.5 rounded">
                                    {t('sidebar.episodeCount', { count: episodes.length })}
                                </span>
                            </div>
                        </div>

                        {/* 全局资产入口 */}
                        <div className="px-3 py-2 border-b border-[var(--glass-stroke-base)]">
                            <button
                                onClick={() => {
                                    onGlobalAssetsClick()
                                    setIsExpanded(false)
                                }}
                                className={`glass-btn-base w-full py-2 px-3 rounded-lg text-left text-sm transition-colors flex items-center justify-start gap-2 ${isGlobalAssetsView
                                        ? 'glass-btn-tone-info'
                                        : 'glass-btn-soft text-[var(--glass-text-secondary)]'
                                    }`}
                            >
                                <AppIcon name="coins" className="w-4 h-4" />
                                <span>{t('globalAssets')}</span>
                            </button>
                        </div>

                        {/* 剧集列表 */}
                        <div className="flex-1 overflow-y-auto p-3 space-y-1">
                            {episodes.length === 0 ? (
                                <div className="text-center py-6 text-[var(--glass-text-tertiary)] text-sm">
                                    {t('sidebar.empty')}
                                </div>
                            ) : (
                                episodes.map((ep) => (
                                    <div key={ep.id} className="group relative">
                                        {editingId === ep.id ? (
                                            // 编辑模式
                                            <div className="flex gap-1">
                                                <input
                                                    type="text"
                                                    value={editingName}
                                                    onChange={(e) => setEditingName(e.target.value)}
                                                    className="glass-input-base flex-1 px-2 py-1.5 text-sm"
                                                    autoFocus
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleRename(ep.id)
                                                        if (e.key === 'Escape') setEditingId(null)
                                                    }}
                                                />
                                                <button
                                                    onClick={() => handleRename(ep.id)}
                                                    className="glass-btn-base glass-btn-tone-info px-2 py-1 text-xs rounded"
                                                >
                                                    {t('sidebar.save')}
                                                </button>
                                            </div>
                                        ) : deleteConfirmId === ep.id ? (
                                            // 删除确认
                                            <div className="bg-[var(--glass-tone-danger-bg)] p-2 rounded-lg">
                                                <p className="text-xs text-[var(--glass-tone-danger-fg)] mb-2">{t('sidebar.deleteConfirm', { name: ep.name })}</p>
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => handleDelete(ep.id)}
                                                        className="glass-btn-base glass-btn-tone-danger flex-1 py-1 text-xs rounded"
                                                    >
                                                        {t('sidebar.delete')}
                                                    </button>
                                                    <button
                                                        onClick={() => setDeleteConfirmId(null)}
                                                        className="glass-btn-base glass-btn-secondary flex-1 py-1 text-xs rounded"
                                                    >
                                                        {t('sidebar.cancel')}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            // 正常显示
                                            <button
                                                onClick={() => {
                                                    onEpisodeSelect(ep.id)
                                                    setIsExpanded(false)
                                                }}
                                                className={`w-full py-2 px-3 rounded-lg text-left text-sm transition-colors flex items-center gap-2 ${currentEpisodeId === ep.id && !isGlobalAssetsView
                                                        ? 'glass-btn-tone-info'
                                                        : 'hover:bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)]'
                                                    }`}
                                            >
                                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${currentEpisodeId === ep.id && !isGlobalAssetsView ? 'bg-[var(--glass-bg-surface)]/25' : 'bg-[var(--glass-bg-muted)]'
                                                    }`}>
                                                    {ep.episodeNumber}
                                                </span>
                                                <span className="truncate flex-1">{ep.name}</span>

                                                {/* 操作按钮 */}
                                                <div className={`flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${currentEpisodeId === ep.id && !isGlobalAssetsView ? 'text-white/80' : 'text-[var(--glass-text-tertiary)]'
                                                    }`}>
                                                    <button
                                                        type="button"
                                                        className="glass-btn-base glass-btn-ghost w-6 h-6 rounded-md p-0 hover:scale-110 transition-transform"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setEditingId(ep.id)
                                                            setEditingName(ep.name)
                                                        }}
                                                        title={t('sidebar.rename')}
                                                    >
                                                        <AppIcon name="editSquare" className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="glass-btn-base glass-btn-ghost w-6 h-6 rounded-md p-0 hover:scale-110 transition-transform"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setDeleteConfirmId(ep.id)
                                                        }}
                                                        title={t('sidebar.delete')}
                                                    >
                                                        <AppIcon name="trash" className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </button>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>

                        {/* 添加剧集 */}
                        <div className="p-3 border-t border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)]">
                            {isCreating ? (
                                <div className="space-y-2">
                                    <input
                                        type="text"
                                        value={newEpisodeName}
                                        onChange={(e) => setNewEpisodeName(e.target.value)}
                                        placeholder={t('sidebar.newEpisodePlaceholder')}
                                        className="glass-input-base w-full px-3 py-2 text-sm rounded-lg"
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleCreate()
                                            if (e.key === 'Escape') {
                                                setIsCreating(false)
                                                setNewEpisodeName('')
                                            }
                                        }}
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleCreate}
                                            disabled={!newEpisodeName.trim()}
                                            className="glass-btn-base glass-btn-primary flex-1 py-1.5 text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {t('sidebar.create')}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setIsCreating(false)
                                                setNewEpisodeName('')
                                            }}
                                            className="glass-btn-base glass-btn-secondary flex-1 py-1.5 text-sm rounded-lg"
                                        >
                                            {t('sidebar.cancel')}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setIsCreating(true)}
                                    className="glass-btn-base glass-btn-tone-success w-full py-2 px-3 rounded-lg text-sm transition-colors flex items-center justify-center gap-1"
                                >
                                    <span>+</span>
                                    <span>{t('sidebar.addEpisode')}</span>
                                </button>
                            )}
                        </div>
                    </div>
                </>
            )}
        </>
    )
}
