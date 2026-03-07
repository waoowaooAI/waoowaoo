'use client'

import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
/**
 * InsertPanelButton - 面板间插入按钮
 * 在两个 PanelCard 之间显示一个 + 号按钮
 */

interface InsertPanelButtonProps {
    onClick: () => void
    disabled?: boolean
}

export default function InsertPanelButton({ onClick, disabled }: InsertPanelButtonProps) {
    const t = useTranslations('storyboard')
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`
                group relative h-7 w-7 rounded-full
                glass-btn-base border border-[var(--glass-stroke-base)]
                bg-[var(--glass-bg-surface)] text-[var(--glass-text-secondary)]
                shadow-[var(--glass-shadow-sm)] transition-all duration-200 ease-out
                flex items-center justify-center
                ${disabled
                    ? 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-tertiary)] cursor-not-allowed'
                    : 'hover:-translate-y-0.5 hover:shadow-[var(--glass-shadow-md)] hover:border-[var(--glass-stroke-focus)] hover:bg-[var(--glass-tone-info-bg)]'
                }
            `}
            title={t('panelActions.insertHere')}
        >
            <AppIcon name="plus" className="w-4 h-4" />

            {/* Hover 时显示提示 */}
            <span className={`
                absolute -top-8 left-1/2 -translate-x-1/2
                px-2 py-1 text-xs text-white bg-[var(--glass-overlay)] rounded
                opacity-0 group-hover:opacity-100
                transition-opacity duration-200
                whitespace-nowrap pointer-events-none
                ${disabled ? 'hidden' : ''}
            `}>
                {t('panelActions.insertPanel')}
            </span>
        </button>
    )
}
