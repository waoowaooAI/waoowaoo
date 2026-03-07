'use client'
import { useTranslations } from 'next-intl'
import { useRefreshProjectAssets } from '@/lib/query/hooks'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { AppIcon } from '@/components/ui/icons'

/**
 * AssetToolbar - 资产管理工具栏组件
 * 从 AssetsStage.tsx 提取，负责批量操作和刷新按钮
 */

interface AssetToolbarProps {
    projectId: string
    totalAssets: number
    totalAppearances: number
    totalLocations: number
    isBatchSubmitting: boolean
    isAnalyzingAssets: boolean
    isGlobalAnalyzing?: boolean
    batchProgress: { current: number; total: number }
    onGenerateAll: () => void
    onRegenerateAll: () => void
    onGlobalAnalyze?: () => void
}

export default function AssetToolbar({
    projectId,
    totalAssets,
    totalAppearances,
    totalLocations,
    isBatchSubmitting,
    isAnalyzingAssets,
    isGlobalAnalyzing = false,
    batchProgress,
    onGenerateAll,
    onRegenerateAll,
    onGlobalAnalyze
}: AssetToolbarProps) {
    // 🔥 使用 React Query 刷新
    const onRefresh = useRefreshProjectAssets(projectId)
    const t = useTranslations('assets')
    const assetTaskRunningState = isBatchSubmitting
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'generate',
            resource: 'image',
            hasOutput: true,
        })
        : null
    return (
        <div className="glass-surface p-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <span className="text-sm font-semibold text-[var(--glass-text-secondary)] inline-flex items-center gap-2">
                        <AppIcon name="diamond" className="w-4 h-4 text-[var(--glass-tone-info-fg)]" />
                        {t("toolbar.assetManagement")}
                    </span>
                    <span className="text-sm text-[var(--glass-text-tertiary)]">
                        {t("toolbar.assetCount", { total: totalAssets, appearances: totalAppearances, locations: totalLocations })}
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
                    <button
                        onClick={onGenerateAll}
                        disabled={isBatchSubmitting || isAnalyzingAssets || isGlobalAnalyzing}
                        className="glass-btn-base glass-btn-tone-success flex items-center gap-2 px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isBatchSubmitting ? (
                            <>
                                <TaskStatusInline state={assetTaskRunningState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                                <span className="text-xs text-white/90">({batchProgress.current}/{batchProgress.total})</span>
                            </>
                        ) : (
                            <>
                                <AppIcon name="image" className="w-4 h-4" />
                                <span>{t("toolbar.generateAll")}</span>
                            </>
                        )}
                    </button>
                    <button
                        onClick={onRegenerateAll}
                        disabled={isBatchSubmitting || isAnalyzingAssets || isGlobalAnalyzing}
                        className="glass-btn-base glass-btn-tone-warning flex items-center gap-2 px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        title={t("toolbar.regenerateAllHint")}
                    >
                        <AppIcon name="refresh" className="w-4 h-4" />
                        <span>{t("toolbar.regenerateAll")}</span>
                    </button>
                    <button
                        onClick={() => onRefresh()}
                        className="glass-btn-base glass-btn-secondary flex items-center gap-2 px-4 py-2 text-sm font-medium border border-[var(--glass-stroke-base)]"
                    >
                        <AppIcon name="refresh" className="w-4 h-4" />
                        <span>{t("common.refresh")}</span>
                    </button>
                </div>
            </div>
        </div>
    )
}
