'use client'

import type { ReactNode } from 'react'

// ─── Types ────────────────────────────────────────────

export interface SegmentedControlOption<T extends string = string> {
    value: T
    label: ReactNode
}

interface SegmentedControlProps<T extends string = string> {
    options: SegmentedControlOption<T>[]
    value: T
    onChange: (value: T) => void
    /** Extra className on the outer container */
    className?: string
}

// ─── Component ────────────────────────────────────────

/**
 * Unified iOS-style segmented control.
 *
 * Single source of truth for all tab/segment UIs across the app.
 * Uses per-button selected styling (not a sliding indicator) for
 * pixel-perfect equal padding on all four sides.
 */
export function SegmentedControl<T extends string = string>({
    options,
    value,
    onChange,
    className = '',
}: SegmentedControlProps<T>) {
    return (
        <div className={`rounded-lg p-[3px] bg-[#f2f2f7] dark:bg-[#1c1c1e] shadow-inner ${className}`}>
            <div
                className="grid"
                style={{ gridTemplateColumns: `repeat(${Math.max(1, options.length)}, minmax(0, 1fr))` }}
            >
                {options.map((opt) => (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => onChange(opt.value)}
                        className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-all cursor-pointer ${value === opt.value
                            ? 'bg-white text-[var(--glass-text-primary)] dark:bg-[#2c2c2e] dark:text-white shadow-[0_3px_8px_rgba(0,0,0,0.12),0_3px_1px_rgba(0,0,0,0.04)] font-bold'
                            : 'text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)]'
                            }`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
        </div>
    )
}
