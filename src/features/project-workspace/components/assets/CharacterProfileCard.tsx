'use client'

import { useTranslations } from 'next-intl'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
/**
 * 角色档案卡片组件
 * 展示角色档案摘要，点击可编辑
 */

import { CharacterProfileData } from '@/types/character-profile'
import { AppIcon } from '@/components/ui/icons'

interface CharacterProfileCardProps {
    characterId: string
    name: string
    profileData: CharacterProfileData
    onEdit: () => void
    onConfirm: () => void
    onUseExisting?: () => void
    onDelete?: () => void
    isConfirming?: boolean
    isDeleting?: boolean
}

/**
 * 游戏品质分级颜色系统
 * S金橙 / A史诗紫 / B稀有蓝 / C精良绿 / D普通灰
 */
interface TierStyle {
    gradient: string
    glow: string
    accent: string
}

const TIER_STYLES: Record<string, TierStyle> = {
    S: { gradient: 'linear-gradient(135deg, #f59e0b, #ef4444)', glow: '0 2px 8px rgba(245,158,11,0.35)', accent: '#b45309' },
    A: { gradient: 'linear-gradient(135deg, #a855f7, #6366f1)', glow: '0 2px 8px rgba(168,85,247,0.3)', accent: '#7c3aed' },
    B: { gradient: 'linear-gradient(135deg, #3b82f6, #06b6d4)', glow: '0 2px 8px rgba(59,130,246,0.3)', accent: '#2563eb' },
    C: { gradient: 'linear-gradient(135deg, #22c55e, #10b981)', glow: '0 2px 8px rgba(34,197,94,0.25)', accent: '#16a34a' },
    D: { gradient: 'linear-gradient(135deg, #9ca3af, #6b7280)', glow: '0 2px 6px rgba(156,163,175,0.2)', accent: '#6b7280' },
}

const ROLE_LEVELS = ['S', 'A', 'B', 'C', 'D'] as const
type RoleLevel = (typeof ROLE_LEVELS)[number]

function isRoleLevel(value: string): value is RoleLevel {
    return ROLE_LEVELS.includes(value as RoleLevel)
}

export default function CharacterProfileCard({
    name,
    profileData,
    onEdit,
    onConfirm,
    onUseExisting,
    onDelete,
    isConfirming = false,
    isDeleting = false
}: CharacterProfileCardProps) {
    const t = useTranslations('assets')
    const deletingState = isDeleting
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'process',
            resource: 'image',
            hasOutput: false,
        })
        : null
    const confirmingState = isConfirming
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'process',
            resource: 'image',
            hasOutput: true,
        })
        : null
    const roleLevel = isRoleLevel(profileData.role_level) ? profileData.role_level : null
    const roleLevelLabel = roleLevel
        ? t(`characterProfile.importance.${roleLevel}`)
        : profileData.role_level
    const tierStyle = roleLevel ? TIER_STYLES[roleLevel] : null

    return (
        <div className="glass-surface overflow-hidden hover:shadow-md transition-shadow">
            <div className="p-5">
                {/* 头部 */}
                <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                        <h3 className="text-base font-bold text-[var(--glass-text-primary)] mb-1.5">{name}</h3>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span
                                className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black text-white tracking-wide"
                                style={{
                                    background: tierStyle?.gradient ?? 'var(--glass-bg-muted)',
                                    boxShadow: tierStyle?.glow ?? 'none',
                                    ...(!tierStyle ? { color: 'var(--glass-text-primary)' } : {}),
                                }}
                            >
                                {roleLevelLabel}
                            </span>
                            <span className="text-xs text-[var(--glass-text-tertiary)]">{profileData.archetype}</span>
                        </div>
                    </div>
                    {/* 删除按钮 */}
                    {onDelete && (
                        <button
                            onClick={onDelete}
                            disabled={isConfirming || isDeleting}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--glass-text-tertiary)] hover:text-[var(--glass-tone-danger-fg)] hover:bg-[var(--glass-tone-danger-bg)] transition-colors disabled:opacity-50 shrink-0"
                            title={t('characterProfile.delete')}
                        >
                            {isDeleting ? (
                                <TaskStatusInline state={deletingState} className="[&_span]:sr-only [&_svg]:text-current" />
                            ) : (
                                <AppIcon name="trash" className="w-4 h-4" />
                            )}
                        </button>
                    )}
                </div>

                {/* 档案摘要 */}
                <div className="space-y-1.5 mb-3">
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-[var(--glass-text-tertiary)] w-[2.5rem] shrink-0 text-xs">{t('characterProfile.summary.gender')}</span>
                        <span className="text-[var(--glass-text-primary)]">{profileData.gender}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-[var(--glass-text-tertiary)] w-[2.5rem] shrink-0 text-xs">{t('characterProfile.summary.age')}</span>
                        <span className="text-[var(--glass-text-primary)]">{profileData.age_range}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-[var(--glass-text-tertiary)] w-[2.5rem] shrink-0 text-xs">{t('characterProfile.summary.era')}</span>
                        <span className="text-[var(--glass-text-primary)]">{profileData.era_period}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-[var(--glass-text-tertiary)] w-[2.5rem] shrink-0 text-xs">{t('characterProfile.summary.class')}</span>
                        <span className="text-[var(--glass-text-primary)]">{profileData.social_class}</span>
                    </div>
                    {profileData.occupation && (
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-[var(--glass-text-tertiary)] w-[2.5rem] shrink-0 text-xs">{t('characterProfile.summary.occupation')}</span>
                            <span className="text-[var(--glass-text-primary)]">{profileData.occupation}</span>
                        </div>
                    )}
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-[var(--glass-text-tertiary)] w-[2.5rem] shrink-0 text-xs">{t('characterProfile.summary.personality')}</span>
                        <div className="flex flex-wrap gap-1">
                            {profileData.personality_tags.map((tag, i) => (
                                <span key={i} className="px-1.5 py-0.5 bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)] rounded text-xs font-medium">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-[var(--glass-text-tertiary)] w-[2.5rem] shrink-0 text-xs">{t('characterProfile.summary.costume')}</span>
                        <span className="text-[var(--glass-text-primary)]">
                            {'●'.repeat(profileData.costume_tier)}{'○'.repeat(5 - profileData.costume_tier)}
                        </span>
                    </div>
                    {profileData.primary_identifier && (
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-[var(--glass-text-tertiary)] w-[2.5rem] shrink-0 text-xs">{t('characterProfile.summary.identifier')}</span>
                            <span className="font-medium" style={{ color: tierStyle?.accent ?? 'var(--glass-tone-warning-fg)' }}>{profileData.primary_identifier}</span>
                        </div>
                    )}
                </div>

                {/* 操作按钮 */}
                <div className="flex gap-2 pt-3 border-t border-[var(--glass-stroke-base)]">
                    <button
                        onClick={onEdit}
                        disabled={isConfirming}
                        className="glass-btn-base glass-btn-secondary flex-1 px-3 py-1.5 text-sm rounded-lg disabled:opacity-50"
                    >
                        {t('characterProfile.editProfile')}
                    </button>
                    {onUseExisting && (
                        <button
                            onClick={onUseExisting}
                            disabled={isConfirming}
                            className="glass-btn-base glass-btn-tone-info flex-1 px-3 py-1.5 text-sm rounded-lg disabled:opacity-50"
                        >
                            {t('characterProfile.useExisting')}
                        </button>
                    )}
                    <button
                        onClick={onConfirm}
                        disabled={isConfirming}
                        className="glass-btn-base glass-btn-primary flex-1 px-3 py-1.5 text-sm rounded-lg disabled:opacity-50"
                    >
                        {isConfirming ? (
                            <TaskStatusInline state={confirmingState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                        ) : (
                            t('characterProfile.confirmAndGenerate')
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
