'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

// ─── Types ────────────────────────────────────────────

export interface SegmentedControlOption<T extends string = string> {
    value: T
    label: ReactNode
}

export interface SegmentedControlIndicator {
    left: number
    width: number
}

type SegmentedControlLayout = 'fill' | 'compact'

interface SegmentedControlProps<T extends string = string> {
    options: SegmentedControlOption<T>[]
    value: T
    onChange: (value: T) => void
    /** Layout mode: stretch to container or keep a compact left-aligned width */
    layout?: SegmentedControlLayout
    /** Extra className on the outer container */
    className?: string
}

export function resolveSegmentedControlIndicator(
    currentIndicator: SegmentedControlIndicator,
    nextIndicator: SegmentedControlIndicator,
): SegmentedControlIndicator {
    if (
        currentIndicator.left === nextIndicator.left
        && currentIndicator.width === nextIndicator.width
    ) {
        return currentIndicator
    }

    return nextIndicator
}

export function buildSegmentedControlOptionValuesSignature<T extends string = string>(
    options: SegmentedControlOption<T>[],
): string {
    return options.map((option) => option.value).join('|')
}

// ─── Component ────────────────────────────────────────

/**
 * Unified iOS-style segmented control with sliding pill indicator.
 *
 * Single source of truth for all tab/segment UIs across the app.
 * Indicator lives inside the grid container to share the same
 * positioning context as buttons — guaranteeing equal padding
 * on all four sides (Apple-style).
 */
export function SegmentedControl<T extends string = string>({
    options,
    value,
    onChange,
    layout = 'fill',
    className = '',
}: SegmentedControlProps<T>) {
    const gridRef = useRef<HTMLDivElement>(null)
    const [indicator, setIndicator] = useState<SegmentedControlIndicator>({ left: 0, width: 0 })
    const indicatorRef = useRef<SegmentedControlIndicator>(indicator)
    const isCompact = layout === 'compact'
    const optionValuesSignature = buildSegmentedControlOptionValuesSignature(options)

    useLayoutEffect(() => {
        if (!gridRef.current) return
        const activeIndex = options.findIndex((opt) => opt.value === value)
        const buttons = gridRef.current.querySelectorAll<HTMLButtonElement>('button')
        const activeButton = buttons[activeIndex]
        if (activeButton) {
            const nextIndicator: SegmentedControlIndicator = {
                left: activeButton.offsetLeft,
                width: activeButton.offsetWidth,
            }
            const resolvedIndicator = resolveSegmentedControlIndicator(indicatorRef.current, nextIndicator)
            if (resolvedIndicator === indicatorRef.current) {
                return
            }

            indicatorRef.current = resolvedIndicator
            setIndicator(resolvedIndicator)
        }
    }, [layout, optionValuesSignature, options, value])

    return (
        <div
            className={`rounded-xl p-[3px] bg-[#e8e8ed] dark:bg-[#1c1c1e] ${isCompact ? 'inline-block max-w-full' : 'block w-full'} ${className}`}
        >
            <div
                ref={gridRef}
                className={isCompact ? 'relative inline-grid grid-flow-col auto-cols-[minmax(96px,max-content)]' : 'relative grid'}
                style={isCompact ? undefined : { gridTemplateColumns: `repeat(${Math.max(1, options.length)}, minmax(0, 1fr))` }}
            >
                {/* Sliding pill indicator */}
                <div
                    className="absolute top-0 bottom-0 rounded-[10px] bg-white dark:bg-[#3a3a3c] shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
                    style={{ left: indicator.left, width: indicator.width }}
                />
                {options.map((opt) => (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => onChange(opt.value)}
                        className={`relative z-10 flex items-center justify-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[13px] font-semibold transition-colors duration-200 cursor-pointer ${value === opt.value
                            ? 'text-[#1d1d1f] dark:text-white'
                            : 'text-[#86868b] hover:text-[#6e6e73]'
                            }`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
        </div>
    )
}
