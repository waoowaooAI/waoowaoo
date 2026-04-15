'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { useProjectAssets, useProjectData } from '@/lib/query/hooks'
import { AppIcon } from '@/components/ui/icons'
import JSZip from 'jszip'
import { logError as _logError } from '@/lib/logging/core'

/**
 * AssetToolbar - 资产管理工具栏组件
 * 从 AssetsStage.tsx 提取，负责资产统计与顶部操作
 */

interface EpisodeOption {
    id: string
    episodeNumber: number
    name: string
}

interface AssetToolbarProps {
    projectId: string
    totalAssets: number
    totalAppearances: number
    totalLocations: number
    totalProps: number
    isBatchSubmitting: boolean
    isAnalyzingAssets: boolean
    isGlobalAnalyzing?: boolean
    onGlobalAnalyze?: () => void
    /** Episode filter */
    episodeId: string | null
    onEpisodeChange: (episodeId: string | null) => void
    episodes: EpisodeOption[]
}

// ─── 剧集筛选 Chip ────────────────────────────────────

function EpisodeChip({
    episodeId,
    onEpisodeChange,
    episodes,
}: {
    episodeId: string | null
    onEpisodeChange: (id: string | null) => void
    episodes: EpisodeOption[]
}) {
    const t = useTranslations('assets')
    const [open, setOpen] = useState(false)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)

    const selectedEpisode = episodes.find((ep) => ep.id === episodeId)
    const label = selectedEpisode ? selectedEpisode.name : t('filterBar.allEpisodes')

    const updatePosition = useCallback(() => {
        if (!triggerRef.current) return
        const rect = triggerRef.current.getBoundingClientRect()
        setMenuPos({
            top: rect.bottom + 6,
            left: rect.left,
        })
    }, [])

    useEffect(() => {
        if (!open) return
        updatePosition()
        const handleClickOutside = (e: MouseEvent) => {
            if (
                triggerRef.current?.contains(e.target as Node) ||
                menuRef.current?.contains(e.target as Node)
            ) return
            setOpen(false)
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [open, updatePosition])

    const handleSelect = (id: string | null) => {
        setOpen(false)
        onEpisodeChange(id)
    }

    return (
        <>
            <button
                ref={triggerRef}
                onClick={() => setOpen((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] font-medium transition-all duration-200 cursor-pointer border ${
                    episodeId
                        ? 'bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)] border-[var(--glass-tone-info-fg)]/20'
                        : 'bg-[#f2f2f7] dark:bg-[#2c2c2e] text-[var(--glass-text-secondary)] border-[var(--glass-stroke-base)] hover:bg-[#e8e8ed] dark:hover:bg-[#3a3a3c]'
                }`}
            >
                <AppIcon name="film" className="w-3.5 h-3.5" />
                <span>{label}</span>
                {episodeId ? (
                    <span
                        role="button"
                        onClick={(e) => { e.stopPropagation(); onEpisodeChange(null) }}
                        className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-[var(--glass-tone-info-fg)]/20 transition-colors"
                    >
                        <AppIcon name="close" className="w-3 h-3" />
                    </span>
                ) : (
                    <AppIcon
                        name="chevronDown"
                        className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                    />
                )}
            </button>
            {open && menuPos && createPortal(
                <div
                    ref={menuRef}
                    className="fixed z-[9999] min-w-[180px] max-h-[320px] overflow-y-auto py-1.5 rounded-xl bg-white dark:bg-[#2c2c2e] shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)] border border-[var(--glass-stroke-base)] animate-in fade-in-0 zoom-in-95 duration-150"
                    style={{ top: menuPos.top, left: menuPos.left }}
                >
                    {/* All episodes option */}
                    <button
                        onClick={() => handleSelect(null)}
                        className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors cursor-pointer ${
                            !episodeId
                                ? 'text-[var(--glass-tone-info-fg)] bg-[var(--glass-tone-info-bg)] font-medium'
                                : 'text-[var(--glass-text-primary)] hover:bg-[var(--glass-bg-muted)]'
                        }`}
                    >
                        <AppIcon name="folderOpen" className="w-4 h-4 text-[var(--glass-text-tertiary)]" />
                        <span>{t('filterBar.allEpisodes')}</span>
                    </button>
                    {/* Divider */}
                    <div className="mx-3 my-1 border-t border-[var(--glass-stroke-base)]" />
                    {/* Episode list */}
                    {episodes.map((ep) => (
                        <button
                            key={ep.id}
                            onClick={() => handleSelect(ep.id)}
                            className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors cursor-pointer ${
                                episodeId === ep.id
                                    ? 'text-[var(--glass-tone-info-fg)] bg-[var(--glass-tone-info-bg)] font-medium'
                                    : 'text-[var(--glass-text-primary)] hover:bg-[var(--glass-bg-muted)]'
                            }`}
                        >
                            <AppIcon name="film" className="w-4 h-4 text-[var(--glass-text-tertiary)]" />
                            <span>{ep.name}</span>
                        </button>
                    ))}
                </div>,
                document.body,
            )}
        </>
    )
}

export default function AssetToolbar({
    projectId,
    totalAssets,
    totalAppearances,
    totalLocations,
    totalProps,
    isBatchSubmitting,
    isAnalyzingAssets,
    isGlobalAnalyzing = false,
    onGlobalAnalyze,
    episodeId,
    onEpisodeChange,
    episodes,
}: AssetToolbarProps) {
    const t = useTranslations('assets')
    const { data: assets } = useProjectAssets(projectId)
    const { data: projectData } = useProjectData(projectId)
    const projectName = projectData?.name
    const [isDownloading, setIsDownloading] = useState(false)

    const handleDownloadAll = async () => {
        const characters = assets?.characters ?? []
        const locations = assets?.locations ?? []
        const props = assets?.props ?? []

        const imageEntries: Array<{ filename: string; url: string }> = []

        // 角色图片
        for (const character of characters) {
            for (const appearance of character.appearances ?? []) {
                const url = appearance.imageUrl
                if (!url) continue
                const safeName = character.name.replace(/[/\\:*?"<>|]/g, '_')
                const filename = appearance.appearanceIndex === 0
                    ? `characters/${safeName}.jpg`
                    : `characters/${safeName}_appearance${appearance.appearanceIndex}.jpg`
                imageEntries.push({ filename, url })
            }
        }

        // 场景图片：取已选中的那张（或第一张）
        for (const location of locations) {
            const selectedImage = location.images?.find((img: { isSelected: boolean; imageUrl: string | null }) => img.isSelected) ?? location.images?.[0]
            const url = selectedImage?.imageUrl
            if (!url) continue
            const safeName = location.name.replace(/[/\\:*?"<>|]/g, '_')
            imageEntries.push({ filename: `locations/${safeName}.jpg`, url })
        }

        for (const prop of props) {
            const selectedImage = prop.images?.find((img: { isSelected: boolean; imageUrl: string | null }) => img.isSelected) ?? prop.images?.[0]
            const url = selectedImage?.imageUrl
            if (!url) continue
            const safeName = prop.name.replace(/[/\\:*?"<>|]/g, '_')
            imageEntries.push({ filename: `props/${safeName}.jpg`, url })
        }

        if (imageEntries.length === 0) {
            alert(t('assetLibrary.downloadEmpty'))
            return
        }

        setIsDownloading(true)
        try {
            const zip = new JSZip()
            await Promise.all(
                imageEntries.map(async ({ filename, url }) => {
                    try {
                        const response = await fetch(url)
                        if (!response.ok) return
                        const blob = await response.blob()
                        zip.file(filename, blob)
                    } catch {
                        // 单张失败不阻断其他
                    }
                })
            )
            const content = await zip.generateAsync({ type: 'blob' })
            const link = document.createElement('a')
            link.href = URL.createObjectURL(content)
            const safeName = projectName ? projectName.replace(/[/\\:*?"<>|]/g, '_') : 'assets'
            link.download = `${safeName}_${new Date().toISOString().slice(0, 10)}.zip`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(link.href)
        } catch (error) {
            _logError('打包下载失败:', error)
            alert(t('assetLibrary.downloadFailed'))
        } finally {
            setIsDownloading(false)
        }
    }

    return (
        <div className="glass-surface p-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <span className="text-sm font-semibold text-[var(--glass-text-secondary)] inline-flex items-center gap-2">
                        <AppIcon name="diamond" className="w-4 h-4 text-[var(--glass-tone-info-fg)]" />
                        {t("toolbar.assetManagement")}
                    </span>
                    {/* 剧集筛选 chip */}
                    {episodes.length > 0 && (
                        <EpisodeChip
                            episodeId={episodeId}
                            onEpisodeChange={onEpisodeChange}
                            episodes={episodes}
                        />
                    )}
                    <span className="text-sm text-[var(--glass-text-tertiary)]">
                        {t("toolbar.assetCount", { total: totalAssets, appearances: totalAppearances, locations: totalLocations, props: totalProps })}
                    </span>
                    {/* 全局资产分析按钮 */}
                    {onGlobalAnalyze && (
                        <button
                            onClick={onGlobalAnalyze}
                            disabled={isGlobalAnalyzing || isBatchSubmitting || isAnalyzingAssets}
                            className="glass-btn-base glass-btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            title={t("toolbar.globalAnalyzeHint")}
                        >
                            <AppIcon name="idea" className="w-3.5 h-3.5" />
                            <span>{t("toolbar.globalAnalyze")}</span>
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {/* 打包下载按钮 */}
                    <button
                        onClick={handleDownloadAll}
                        disabled={isDownloading || totalAssets === 0}
                        title={t("toolbar.downloadAll")}
                        className="glass-btn-base glass-btn-secondary flex items-center justify-center w-9 h-9 disabled:opacity-50 disabled:cursor-not-allowed border border-[var(--glass-stroke-base)]"
                    >
                        <AppIcon
                            name={isDownloading ? 'refresh' : 'download'}
                            className={`w-4 h-4 ${isDownloading ? 'animate-spin' : ''}`}
                        />
                    </button>
                </div>
            </div>
        </div>
    )
}
