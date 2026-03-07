'use client'

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AppIcon } from '@/components/ui/icons'

// ─── Constants & Types ─────────────────────────────────────────

const VIEWPORT_EDGE_GAP = 8
const DEFAULT_MAX_HEIGHT = 280

export interface SelectOption {
    value: string
    label: string
    description?: string
    icon?: string
    disabled?: boolean
}

export interface CustomSelectProps {
    options: SelectOption[]
    value?: string
    onChange: (value: string) => void
    placeholder?: string
    disabled?: boolean
    className?: string
}

// ─── Variant 1: Pill / Solid Card Style ─────────────────────────
// (最贴近”默认模型配置“卡片的经典风格，四周有饱满的边框与微弱底色)

export function SelectVariantCard({
    options,
    value,
    onChange,
    placeholder = '请选择...',
    disabled = false,
    className = '',
}: CustomSelectProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({})
    const triggerRef = useRef<HTMLButtonElement>(null)
    const panelRef = useRef<HTMLDivElement>(null)

    const selectedOption = options.find((opt) => opt.value === value)

    const updatePosition = useCallback(() => {
        if (!triggerRef.current) return
        const rect = triggerRef.current.getBoundingClientRect()
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight
        const spaceBelow = viewportHeight - rect.bottom - VIEWPORT_EDGE_GAP
        const spaceAbove = rect.top - VIEWPORT_EDGE_GAP

        let openUpward = false
        let currentMaxHeight = DEFAULT_MAX_HEIGHT

        if (spaceBelow < 200 && spaceAbove > spaceBelow) {
            openUpward = true
            currentMaxHeight = Math.min(DEFAULT_MAX_HEIGHT, spaceAbove)
        } else {
            currentMaxHeight = Math.min(DEFAULT_MAX_HEIGHT, spaceBelow)
        }

        setPanelStyle({
            position: 'fixed',
            left: rect.left,
            width: rect.width,
            maxHeight: currentMaxHeight,
            ...(openUpward
                ? { bottom: viewportHeight - rect.top + 4 }
                : { top: rect.bottom + 4 }),
        })
    }, [])

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            const target = e.target as Node
            if (triggerRef.current?.contains(target)) return
            if (panelRef.current?.contains(target)) return
            setIsOpen(false)
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    useLayoutEffect(() => {
        if (!isOpen) return
        updatePosition()
        window.addEventListener('resize', updatePosition)
        window.addEventListener('scroll', updatePosition, true)
        return () => {
            window.removeEventListener('resize', updatePosition)
            window.removeEventListener('scroll', updatePosition, true)
        }
    }, [isOpen, updatePosition])

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                disabled={disabled}
                onClick={() => setIsOpen(!isOpen)}
                className={`glass-input-base w-full flex items-center justify-between px-3 py-2.5 transition-all text-left ${isOpen ? 'ring-1 ring-[var(--glass-stroke-active)]' : ''
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[var(--glass-bg-hover)]'} ${className}`}
            >
                <div className="flex-1 min-w-0 pr-2">
                    {selectedOption ? (
                        <div className="flex flex-col">
                            <span className="text-sm font-medium text-[var(--glass-text-primary)] truncate">
                                {selectedOption.label}
                            </span>
                            {selectedOption.description && (
                                <span className="text-[11px] text-[var(--glass-text-tertiary)] truncate mt-0.5">
                                    {selectedOption.description}
                                </span>
                            )}
                        </div>
                    ) : (
                        <span className="text-sm text-[var(--glass-text-tertiary)]">{placeholder}</span>
                    )}
                </div>
                <AppIcon
                    name="chevronDown"
                    className={`w-4 h-4 text-[var(--glass-text-tertiary)] shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''
                        }`}
                />
            </button>

            {isOpen &&
                createPortal(
                    <div
                        ref={panelRef}
                        className="glass-surface-modal z-[9999] overflow-hidden flex flex-col rounded-xl shadow-xl border border-[var(--glass-stroke-base)] py-1"
                        style={panelStyle}
                    >
                        <div className="overflow-y-auto custom-scrollbar px-1 py-1 max-h-full">
                            {options.map((opt) => {
                                const isSelected = value === opt.value
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        disabled={opt.disabled}
                                        onClick={() => {
                                            if (opt.disabled) return
                                            onChange(opt.value)
                                            setIsOpen(false)
                                        }}
                                        className={`flex items-center w-full px-3 py-2 my-0.5 rounded-lg text-left transition-all ${isSelected
                                                ? 'bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)] shadow-[0_0_0_1px_rgba(79,128,255,0.35)]'
                                                : opt.disabled
                                                    ? 'text-[var(--glass-text-tertiary)] opacity-60 cursor-not-allowed'
                                                    : 'hover:bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)]'
                                            }`}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className={`text-sm ${isSelected ? 'font-semibold' : 'font-medium'}`}>
                                                {opt.label}
                                            </div>
                                            {opt.description && (
                                                <div className={`text-[11px] mt-0.5 ${isSelected ? 'text-[var(--glass-tone-info-fg)] opacity-80' : 'text-[var(--glass-text-tertiary)]'}`}>
                                                    {opt.description}
                                                </div>
                                            )}
                                        </div>
                                        {isSelected && (
                                            <AppIcon name="check" className="w-4 h-4 shrink-0 overflow-visible ml-2" />
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    </div>,
                    document.body
                )}
        </>
    )
}

// ─── Variant 2: Minimalist Line / Base Style ────────────────────
// (底部细线风格，适用于表单密集的区域，突出内容而非边框)

export function SelectVariantMinimal({
    options,
    value,
    onChange,
    placeholder = '请选择...',
    disabled = false,
    className = '',
}: CustomSelectProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({})
    const triggerRef = useRef<HTMLButtonElement>(null)
    const panelRef = useRef<HTMLDivElement>(null)

    const selectedOption = options.find((opt) => opt.value === value)

    const updatePosition = useCallback(() => {
        if (!triggerRef.current) return
        const rect = triggerRef.current.getBoundingClientRect()
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight
        const spaceBelow = viewportHeight - rect.bottom - VIEWPORT_EDGE_GAP
        const spaceAbove = rect.top - VIEWPORT_EDGE_GAP

        let openUpward = false
        let currentMaxHeight = DEFAULT_MAX_HEIGHT

        if (spaceBelow < 200 && spaceAbove > spaceBelow) {
            openUpward = true
            currentMaxHeight = Math.min(DEFAULT_MAX_HEIGHT, spaceAbove)
        } else {
            currentMaxHeight = Math.min(DEFAULT_MAX_HEIGHT, spaceBelow)
        }

        setPanelStyle({
            position: 'fixed',
            left: rect.left,
            width: rect.width,
            maxHeight: currentMaxHeight,
            ...(openUpward
                ? { bottom: viewportHeight - rect.top + 4 }
                : { top: rect.bottom + 4 }),
        })
    }, [])

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            const target = e.target as Node
            if (triggerRef.current?.contains(target)) return
            if (panelRef.current?.contains(target)) return
            setIsOpen(false)
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    useLayoutEffect(() => {
        if (!isOpen) return
        updatePosition()
        window.addEventListener('resize', updatePosition)
        window.addEventListener('scroll', updatePosition, true)
        return () => {
            window.removeEventListener('resize', updatePosition)
            window.removeEventListener('scroll', updatePosition, true)
        }
    }, [isOpen, updatePosition])

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                disabled={disabled}
                onClick={() => setIsOpen(!isOpen)}
                className={`group flex items-center justify-between w-full py-2 px-1 text-left transition-all border-b border-[var(--glass-stroke-base)] ${isOpen ? 'border-[var(--glass-text-primary)]' : 'hover:border-[var(--glass-text-secondary)]'
                    } ${disabled ? 'opacity-50 cursor-not-allowed border-[var(--glass-stroke-subtle)]' : 'cursor-pointer'} ${className}`}
            >
                <div className="flex-1 min-w-0">
                    {selectedOption ? (
                        <span className="text-sm font-medium text-[var(--glass-text-primary)] truncate">
                            {selectedOption.label}
                        </span>
                    ) : (
                        <span className="text-sm text-[var(--glass-text-tertiary)]">{placeholder}</span>
                    )}
                </div>
                <AppIcon
                    name="chevronDown"
                    className={`w-4 h-4 text-[var(--glass-text-tertiary)] shrink-0 transition-all ${isOpen ? 'rotate-180 text-[var(--glass-text-primary)]' : 'group-hover:text-[var(--glass-text-secondary)]'
                        }`}
                />
            </button>

            {isOpen &&
                createPortal(
                    <div
                        ref={panelRef}
                        className="glass-surface-modal z-[9999] overflow-hidden flex flex-col rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-[var(--glass-stroke-subtle)] py-1 bg-gradient-to-b from-[var(--glass-bg-surface-strong)] to-[var(--glass-bg-surface)] backdrop-blur-md"
                        style={panelStyle}
                    >
                        <div className="overflow-y-auto custom-scrollbar px-1 py-1 max-h-full">
                            {options.map((opt) => {
                                const isSelected = value === opt.value
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        disabled={opt.disabled}
                                        onClick={() => {
                                            if (opt.disabled) return
                                            onChange(opt.value)
                                            setIsOpen(false)
                                        }}
                                        className={`flex items-center w-full px-4 py-2.5 my-0.5 rounded-md text-left transition-all ${isSelected
                                                ? 'bg-[var(--glass-text-primary)] text-white dark:text-black dark:bg-[var(--glass-text-primary)] shadow-sm'
                                                : opt.disabled
                                                    ? 'text-[var(--glass-text-tertiary)] opacity-60 cursor-not-allowed'
                                                    : 'hover:bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)]'
                                            }`}
                                    >
                                        <span className={`flex-1 min-w-0 text-sm ${isSelected ? 'font-semibold' : 'font-medium'}`}>
                                            {opt.label}
                                        </span>
                                        {isSelected && (
                                            <AppIcon name="check" className="w-4 h-4 shrink-0 overflow-visible ml-2" />
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    </div>,
                    document.body
                )}
        </>
    )
}

// ─── Variant 3: Ghost / Lightweight ─────────────────────────────
// (背景透明，只有hover态有色块，适合用于工具栏、筛选器等紧凑小巧的场景)

export function SelectVariantGhost({
    options,
    value,
    onChange,
    placeholder = '请选择...',
    disabled = false,
    className = '',
}: CustomSelectProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({})
    const triggerRef = useRef<HTMLButtonElement>(null)
    const panelRef = useRef<HTMLDivElement>(null)

    const selectedOption = options.find((opt) => opt.value === value)

    const updatePosition = useCallback(() => {
        if (!triggerRef.current) return
        const rect = triggerRef.current.getBoundingClientRect()
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight
        const spaceBelow = viewportHeight - rect.bottom - VIEWPORT_EDGE_GAP
        const spaceAbove = rect.top - VIEWPORT_EDGE_GAP

        let openUpward = false
        let currentMaxHeight = DEFAULT_MAX_HEIGHT

        if (spaceBelow < 200 && spaceAbove > spaceBelow) {
            openUpward = true
            currentMaxHeight = Math.min(DEFAULT_MAX_HEIGHT, spaceAbove)
        } else {
            currentMaxHeight = Math.min(DEFAULT_MAX_HEIGHT, spaceBelow)
        }

        setPanelStyle({
            position: 'fixed',
            left: rect.left,
            width: Math.max(rect.width, 180), // Ghost往往自身较小，给下拉留点宽度
            maxHeight: currentMaxHeight,
            ...(openUpward
                ? { bottom: viewportHeight - rect.top + 4 }
                : { top: rect.bottom + 4 }),
        })
    }, [])

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            const target = e.target as Node
            if (triggerRef.current?.contains(target)) return
            if (panelRef.current?.contains(target)) return
            setIsOpen(false)
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    useLayoutEffect(() => {
        if (!isOpen) return
        updatePosition()
        window.addEventListener('resize', updatePosition)
        window.addEventListener('scroll', updatePosition, true)
        return () => {
            window.removeEventListener('resize', updatePosition)
            window.removeEventListener('scroll', updatePosition, true)
        }
    }, [isOpen, updatePosition])

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                disabled={disabled}
                onClick={() => setIsOpen(!isOpen)}
                className={`inline-flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg transition-colors text-left ${isOpen ? 'bg-[var(--glass-bg-hover)]' : 'hover:bg-[var(--glass-bg-surface-strong)]'
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
            >
                <span className={`text-[13px] whitespace-nowrap overflow-hidden text-ellipsis ${selectedOption ? 'font-medium text-[var(--glass-text-secondary)]' : 'text-[var(--glass-text-tertiary)]'}`}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <AppIcon
                    name="chevronDown"
                    className={`w-3.5 h-3.5 mt-0.5 text-[var(--glass-text-tertiary)] shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''
                        }`}
                />
            </button>

            {isOpen &&
                createPortal(
                    <div
                        ref={panelRef}
                        className="glass-surface-modal z-[9999] overflow-hidden flex flex-col rounded-xl shadow-lg border border-[var(--glass-stroke-subtle)] py-1"
                        style={panelStyle}
                    >
                        <div className="overflow-y-auto custom-scrollbar p-1 max-h-full space-y-0.5">
                            {options.map((opt) => {
                                const isSelected = value === opt.value
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        disabled={opt.disabled}
                                        onClick={() => {
                                            if (opt.disabled) return
                                            onChange(opt.value)
                                            setIsOpen(false)
                                        }}
                                        className={`flex items-center w-full px-2.5 py-1.5 rounded-md text-left transition-colors ${isSelected
                                                ? 'bg-[var(--glass-bg-active)] text-[var(--glass-text-primary)]'
                                                : opt.disabled
                                                    ? 'text-[var(--glass-text-tertiary)] opacity-60 cursor-not-allowed'
                                                    : 'hover:bg-[var(--glass-bg-hover)] text-[var(--glass-text-secondary)]'
                                            }`}
                                    >
                                        <span className={`flex-1 min-w-0 text-[13px] ${isSelected ? 'font-medium' : ''}`}>
                                            {opt.label}
                                        </span>
                                        {isSelected && (
                                            <AppIcon name="check" className="w-3.5 h-3.5 shrink-0 overflow-visible ml-2 text-[var(--glass-text-primary)]" />
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    </div>,
                    document.body
                )}
        </>
    )
}
