'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'

interface PasswordStrengthIndicatorProps {
    password: string
}

type StrengthLevel = 'weak' | 'fair' | 'good' | 'strong'

interface StrengthResult {
    /** 0-4 分 */
    score: number
    level: StrengthLevel
}

/**
 * 评估密码强度。
 *
 * 判定维度：
 * - 字符类型多样性（小写、大写、数字、特殊字符）
 * - 长度
 * - 不是纯重复 / 纯顺序
 *
 * 规则：
 * - 只有 1 种字符类型（如纯数字、纯小写）→ weak
 * - 2 种字符类型 + 长度 ≥ 8 → fair
 * - 3 种字符类型 + 长度 ≥ 8 → good
 * - 4 种字符类型 + 长度 ≥ 10 → strong
 */
function evaluateStrength(password: string): StrengthResult {
    if (!password) return { score: 0, level: 'weak' }

    // 统计字符类型
    const hasLower = /[a-z]/.test(password)
    const hasUpper = /[A-Z]/.test(password)
    const hasDigit = /\d/.test(password)
    const hasSpecial = /[^a-zA-Z0-9]/.test(password)
    const charTypes = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length

    // 检查是否全是同一字符重复（如 aaaaaa、111111）
    const isAllSame = new Set(password).size === 1

    // 纯单类型 或 全重复 → 弱
    if (charTypes <= 1 || isAllSame) {
        return { score: 1, level: 'weak' }
    }

    // 长度不够 → 弱
    if (password.length < 8) {
        return { score: 1, level: 'weak' }
    }

    // 2 种字符类型 + 长度 ≥ 8 → 一般
    if (charTypes === 2) {
        return { score: 2, level: 'fair' }
    }

    // 3 种字符类型 + 长度 ≥ 8 → 良好
    if (charTypes === 3) {
        return { score: 3, level: 'good' }
    }

    // 4 种字符类型 + 长度 ≥ 10 → 强
    if (charTypes >= 4 && password.length >= 10) {
        return { score: 4, level: 'strong' }
    }

    // 4 种类型但长度不够 10 → 良好
    return { score: 3, level: 'good' }
}

const LEVEL_STYLES: Record<StrengthLevel, { color: string; bgActive: string }> = {
    weak: {
        color: 'var(--glass-tone-danger-fg)',
        bgActive: 'var(--glass-tone-danger-fg)',
    },
    fair: {
        color: 'var(--glass-tone-warning-fg)',
        bgActive: 'var(--glass-tone-warning-fg)',
    },
    good: {
        color: 'var(--glass-tone-info-fg)',
        bgActive: 'var(--glass-tone-info-fg)',
    },
    strong: {
        color: 'var(--glass-tone-success-fg)',
        bgActive: 'var(--glass-tone-success-fg)',
    },
}

export default function PasswordStrengthIndicator({ password }: PasswordStrengthIndicatorProps) {
    const t = useTranslations('auth')

    const { score, level } = useMemo(() => evaluateStrength(password), [password])
    const styles = LEVEL_STYLES[level]

    if (!password) return null

    return (
        <div className="mt-2 space-y-1.5">
            {/* 强度条 */}
            <div className="flex gap-1">
                {[1, 2, 3, 4].map((segment) => (
                    <div
                        key={segment}
                        className="h-1 flex-1 rounded-full transition-all duration-300"
                        style={{
                            backgroundColor: segment <= score
                                ? styles.bgActive
                                : 'color-mix(in srgb, var(--glass-text-tertiary) 30%, transparent)',
                        }}
                    />
                ))}
            </div>

            {/* 文字提示 */}
            <p
                className="text-xs transition-colors duration-300"
                style={{ color: styles.color }}
            >
                {t(`passwordStrength.${level}`)}
            </p>
        </div>
    )
}
