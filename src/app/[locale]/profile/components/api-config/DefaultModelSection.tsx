'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { CustomModel } from './types'
import { AppIcon } from '@/components/ui/icons'

interface DefaultModelSectionProps {
    type: 'llm' | 'image' | 'video' | 'lipsync'
    models: CustomModel[]
    defaultModels: {
        analysisModel?: string
        imageModel?: string
        videoModel?: string
        lipSyncModel?: string
    }
    onUpdateDefault: (field: string, modelKey: string) => void
}

export function DefaultModelSection({
    type,
    models,
    defaultModels,
    onUpdateDefault
}: DefaultModelSectionProps) {
    const t = useTranslations('apiConfig')

    // 只显示已启用的模型
    const enabledModels = models.filter(m => m.enabled)

    if (enabledModels.length === 0) {
        return null
    }

    // 根据类型确定要显示的选择器
    const selectors = type === 'llm'
        ? [{ field: 'analysisModel', label: t('defaultModel.analysis') }]
        : type === 'image'
            ? [{ field: 'imageModel', label: t('defaultModel.image') }]
            : type === 'video'
                ? [{ field: 'videoModel', label: t('defaultModel.video') }]
                : [{ field: 'lipSyncModel', label: t('lipsyncDefault') }]

    return (
        <div className="glass-surface rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)]">
                    <AppIcon name="sparklesAlt" className="w-4 h-4" />
                </span>
                <h3 className="text-sm font-semibold text-[var(--glass-text-primary)]">{t('defaultModel.title')}</h3>
            </div>

            <p className="mb-4 text-xs text-[var(--glass-text-secondary)]">{t('defaultModel.hint')}</p>

            <div className="grid gap-3">
                {selectors.map(({ field, label }) => (
                    <div key={field} className="flex items-center gap-3">
                        <label className="w-24 shrink-0 text-sm text-[var(--glass-text-secondary)]">{label}</label>
                        <select
                            value={defaultModels[field as keyof typeof defaultModels] || ''}
                            onChange={(e) => onUpdateDefault(field, e.target.value)}
                            className="glass-select-base flex-1 px-3 py-2 text-sm"
                        >
                            <option value="">{t('defaultModel.notSelected')}</option>
                            {enabledModels.map((model) => (
                                <option key={model.modelKey} value={model.modelKey}>
                                    {model.name}
                                </option>
                            ))}
                        </select>
                    </div>
                ))}
            </div>
        </div>
    )
}
