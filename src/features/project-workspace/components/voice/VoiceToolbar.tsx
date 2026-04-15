'use client'
import { useTranslations } from 'next-intl'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'

interface VoiceToolbarProps {
    onBack?: () => void
    onAddLine: () => void
    onAnalyze: () => void
    onGenerateAll: () => void
    onDownloadAll: () => void
    analyzing: boolean
    isBatchSubmitting: boolean
    runningCount: number
    isDownloading: boolean
    allSpeakersHaveVoice: boolean
    totalLines: number
    linesWithVoice: number
    linesWithAudio: number
}

export default function VoiceToolbar({
    onBack,
    onAddLine,
    onAnalyze,
    onGenerateAll,
    onDownloadAll,
    analyzing,
    isBatchSubmitting,
    runningCount,
    isDownloading,
    allSpeakersHaveVoice,
    totalLines,
    linesWithVoice,
    linesWithAudio
}: VoiceToolbarProps) {
    const t = useTranslations('voice')
    const voiceTaskRunningState = isBatchSubmitting
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'generate',
            resource: 'audio',
            hasOutput: linesWithAudio > 0,
        })
        : null
    const voiceDownloadRunningState = isDownloading
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'process',
            resource: 'audio',
            hasOutput: linesWithAudio > 0,
        })
        : null

    return (
        <div className="glass-surface-elevated p-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 px-5 py-2.5 bg-[var(--glass-bg-surface)] text-[var(--glass-text-secondary)] font-medium rounded-xl border border-[var(--glass-stroke-base)] hover:bg-[var(--glass-bg-muted)] hover:text-[var(--glass-tone-info-fg)] transition-all"
                    >
                        {t("toolbar.back")}
                    </button>
                    <button
                        onClick={onAnalyze}
                        disabled={analyzing}
                        className="glass-btn-base glass-btn-primary flex items-center gap-2 px-5 py-2.5 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {analyzing ? t("assets.stage.analyzing") : t("toolbar.analyzeLines")}
                    </button>
                    <button
                        onClick={onAddLine}
                        className="glass-btn-base glass-btn-secondary flex items-center gap-2 px-5 py-2.5 font-medium border border-[var(--glass-stroke-base)]"
                    >
                        {t("toolbar.addLine")}
                    </button>
                    <button
                        onClick={onGenerateAll}
                        disabled={isBatchSubmitting || !allSpeakersHaveVoice || totalLines === 0}
                        className="glass-btn-base glass-btn-tone-success flex items-center gap-2 px-5 py-2.5 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        title={!allSpeakersHaveVoice ? t("toolbar.uploadReferenceHint") : ''}
                    >
                        {isBatchSubmitting ? (
                            <>
                                <TaskStatusInline state={voiceTaskRunningState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                                <span className="text-xs text-white/90">({runningCount})</span>
                            </>
                        ) : t("toolbar.generateAll")}
                    </button>
                    <button
                        onClick={onDownloadAll}
                        disabled={linesWithAudio === 0 || isDownloading}
                        className="glass-btn-base glass-btn-tone-info flex items-center gap-2 px-5 py-2.5 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        title={linesWithAudio === 0 ? t("toolbar.noDownload") : t("toolbar.downloadCount", { count: linesWithAudio })}
                    >
                        {isDownloading ? (
                            <TaskStatusInline state={voiceDownloadRunningState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                        ) : t("toolbar.downloadAll")}
                    </button>
                </div>
                <div className="text-sm text-[var(--glass-text-tertiary)]">
                    {t("toolbar.stats", { total: totalLines, withVoice: linesWithVoice, withAudio: linesWithAudio })}
                </div>
            </div>
        </div>
    )
}
