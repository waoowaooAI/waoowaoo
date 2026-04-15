'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'

interface EmotionSettingsPanelProps {
    lineId: string
    emotionPrompt: string | null
    emotionStrength: number
    onSave: (lineId: string, emotionPrompt: string | null, emotionStrength: number) => void
    onGenerate: (lineId: string) => void
    isVoiceGenerationRunning: boolean
}

export default function EmotionSettingsPanel({
    lineId,
    emotionPrompt,
    emotionStrength,
    onSave,
    onGenerate,
    isVoiceGenerationRunning
}: EmotionSettingsPanelProps) {
    const t = useTranslations('voice')
    const voiceGenerationState = isVoiceGenerationRunning
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'generate',
            resource: 'audio',
            hasOutput: false,
        })
        : null
    const [prompt, setPrompt] = useState(emotionPrompt || '')
    const [strength, setStrength] = useState(emotionStrength)

    const handlePromptChange = (value: string) => {
        setPrompt(value)
    }

    const handleStrengthChange = (value: number) => {
        setStrength(value)
    }

    const handleGenerate = () => {
        onSave(lineId, prompt.trim() || null, strength)
        onGenerate(lineId)
    }

    return (
        <div className="px-4 py-3 bg-[var(--glass-tone-info-bg)] space-y-3">
            {/* 情绪提示词 */}
            <div>
                <label className="block text-xs text-[var(--glass-tone-info-fg)] mb-1.5 font-medium">
                    {t("emotionPrompt")} <span className="text-[var(--glass-text-tertiary)] font-normal">{t("emotionPromptTip")}</span>
                </label>
                <input
                    type="text"
                    value={prompt}
                    onChange={(e) => handlePromptChange(e.target.value)}
                    placeholder={t("emotionPlaceholder")}
                    className="w-full px-3 py-2 text-sm border border-[var(--glass-stroke-focus)]/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--glass-tone-info-fg)]/50 focus:border-[var(--glass-stroke-focus)] bg-[var(--glass-bg-surface)]"
                />
            </div>

            {/* 情绪强度滑块 */}
            <div>
                <label className="block text-xs text-[var(--glass-tone-info-fg)] mb-1.5 font-medium">
                    {t("emotionStrength")}: <span className="font-bold">{strength.toFixed(1)}</span>
                </label>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={strength}
                    onChange={(e) => handleStrengthChange(parseFloat(e.target.value))}
                    className="w-full h-2 bg-[var(--glass-tone-info-bg)] rounded-lg appearance-none cursor-pointer accent-[var(--glass-accent-from)]"
                />
                <div className="flex justify-between text-[10px] text-[var(--glass-text-tertiary)] mt-1">
                    <span>{t("flat")}</span>
                    <span>{t("intense")}</span>
                </div>
            </div>

            {/* 生成语音按钮 */}
            <button
                onClick={handleGenerate}
                disabled={isVoiceGenerationRunning}
                className="w-full py-2 text-sm bg-[var(--glass-tone-success-fg)] text-white rounded-xl hover:bg-[var(--glass-tone-success-fg)] font-medium transition-all shadow-[var(--glass-shadow-sm)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isVoiceGenerationRunning ? (
                    <TaskStatusInline state={voiceGenerationState} className="justify-center text-white [&>span]:text-white [&_svg]:text-white" />
                ) : t("generateVoice")}
            </button>
        </div>
    )
}
