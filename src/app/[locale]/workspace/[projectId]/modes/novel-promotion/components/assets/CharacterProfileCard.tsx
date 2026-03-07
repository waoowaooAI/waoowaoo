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

const ROLE_LEVEL_COLORS = {
    S: 'bg-[var(--glass-tone-warning-bg)] text-[var(--glass-tone-warning-fg)]',
    A: 'bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]',
    B: 'bg-[var(--glass-tone-neutral-bg)] text-[var(--glass-tone-neutral-fg)]',
    C: 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-primary)]',
    D: 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)]'
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
    const roleLevelColor = roleLevel
        ? ROLE_LEVEL_COLORS[roleLevel]
        : 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-primary)]'

    return (
        <div className="bg-[var(--glass-bg-surface)] rounded-xl border border-[var(--glass-stroke-base)] p-4 hover:shadow-md transition-shadow">
            {/* 头部 */}
            <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                    <h3 className="font-semibold text-[var(--glass-text-primary)] mb-1">{name}</h3>
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${roleLevelColor}`}>
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
                        className="p-1.5 text-[var(--glass-text-tertiary)] hover:text-[var(--glass-tone-danger-fg)] hover:bg-[var(--glass-tone-danger-bg)] rounded-lg transition-colors disabled:opacity-50"
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
                    <span className="text-[var(--glass-text-tertiary)] w-16">{t('characterProfile.summary.gender')}</span>
                    <span className="text-[var(--glass-text-primary)]">{profileData.gender}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-[var(--glass-text-tertiary)] w-16">{t('characterProfile.summary.age')}</span>
                    <span className="text-[var(--glass-text-primary)]">{profileData.age_range}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-[var(--glass-text-tertiary)] w-16">{t('characterProfile.summary.era')}</span>
                    <span className="text-[var(--glass-text-primary)]">{profileData.era_period}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-[var(--glass-text-tertiary)] w-16">{t('characterProfile.summary.class')}</span>
                    <span className="text-[var(--glass-text-primary)]">{profileData.social_class}</span>
                </div>
                {profileData.occupation && (
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-[var(--glass-text-tertiary)] w-16">{t('characterProfile.summary.occupation')}</span>
                        <span className="text-[var(--glass-text-primary)]">{profileData.occupation}</span>
                    </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-[var(--glass-text-tertiary)] w-16">{t('characterProfile.summary.personality')}</span>
                    <div className="flex flex-wrap gap-1">
                        {profileData.personality_tags.map((tag, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)] rounded text-xs">
                                {tag}
                            </span>
                        ))}
                    </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-[var(--glass-text-tertiary)] w-16">{t('characterProfile.summary.costume')}</span>
                    <span className="text-[var(--glass-text-primary)]">
                        {'●'.repeat(profileData.costume_tier)}
                    </span>
                </div>
                {profileData.primary_identifier && (
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-[var(--glass-text-tertiary)] w-16">{t('characterProfile.summary.identifier')}</span>
                        <span className="text-[var(--glass-tone-warning-fg)] font-medium">{profileData.primary_identifier}</span>
                    </div>
                )}
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-2">
                <button
                    onClick={onEdit}
                    disabled={isConfirming}
                    className="flex-1 px-3 py-1.5 text-sm border border-[var(--glass-stroke-strong)] rounded-lg hover:bg-[var(--glass-bg-muted)] transition-colors disabled:opacity-50"
                >
                    {t('characterProfile.editProfile')}
                </button>
                {onUseExisting && (
                    <button
                        onClick={onUseExisting}
                        disabled={isConfirming}
                        className="flex-1 px-3 py-1.5 text-sm border border-[var(--glass-stroke-focus)] text-[var(--glass-tone-info-fg)] rounded-lg hover:bg-[var(--glass-tone-info-bg)] transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                        {t('characterProfile.useExisting')}
                    </button>
                )}
                <button
                    onClick={onConfirm}
                    disabled={isConfirming}
                    className="flex-1 px-3 py-1.5 text-sm bg-[var(--glass-accent-from)] text-white rounded-lg hover:bg-[var(--glass-accent-to)] transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                >
                    {isConfirming ? (
                        <TaskStatusInline state={confirmingState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                    ) : (
                        t('characterProfile.confirmAndGenerate')
                    )}
                </button>
            </div>
        </div>
    )
}
