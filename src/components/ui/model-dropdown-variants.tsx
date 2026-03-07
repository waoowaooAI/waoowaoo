'use client'

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AppIcon } from '@/components/ui/icons'
import type { ModelCapabilityOption, CapabilityFieldDefinition } from './config-modals/ModelCapabilityDropdown'
import type { CapabilityValue } from '@/lib/model-config-contract'
export interface ModelDropdownTestProps {
    models: ModelCapabilityOption[]
    value: string | undefined
    onModelChange: (modelKey: string) => void
    capabilityFields: CapabilityFieldDefinition[]
    capabilityOverrides: Record<string, CapabilityValue>
    onCapabilityChange: (field: string, rawValue: string, sample: CapabilityValue) => void
    placeholder?: string
}

const VIEWPORT_EDGE_GAP = 8
const DEFAULT_MAX_HEIGHT = 400

function useDropdown(isOpen: boolean, setIsOpen: (val: boolean) => void) {
    const triggerRef = useRef<HTMLButtonElement>(null)
    const panelRef = useRef<HTMLDivElement>(null)
    const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({})

    const updatePosition = useCallback(() => {
        if (!triggerRef.current) return
        const rect = triggerRef.current.getBoundingClientRect()
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight
        const spaceBelow = viewportHeight - rect.bottom - VIEWPORT_EDGE_GAP
        const spaceAbove = rect.top - VIEWPORT_EDGE_GAP

        let openUpward = false
        let currentMaxHeight = DEFAULT_MAX_HEIGHT

        if (spaceBelow < 250 && spaceAbove > spaceBelow) {
            openUpward = true
            currentMaxHeight = Math.min(DEFAULT_MAX_HEIGHT, spaceAbove)
        } else {
            currentMaxHeight = Math.min(DEFAULT_MAX_HEIGHT, spaceBelow)
        }

        setPanelStyle({
            position: 'fixed',
            left: rect.left,
            width: Math.max(rect.width, 320),
            maxHeight: currentMaxHeight,
            ...(openUpward
                ? { bottom: viewportHeight - rect.top + 6 }
                : { top: rect.bottom + 6 }),
            zIndex: 9999
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
    }, [setIsOpen])

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

    return { triggerRef, panelRef, panelStyle }
}

function resolveParamSummary(fields: CapabilityFieldDefinition[], overrides: Record<string, CapabilityValue>) {
    return fields.map(def => {
        const val = overrides[def.field] !== undefined ? String(overrides[def.field]) : String(def.options[0] || '')
        if (def.field === 'duration') return `${val}s`
        return val
    }).filter(Boolean).join(' · ')
}

// ============================================================================
// Variant 1: Apple iOS Segmented Control Style
// Clean white/glass, segmented parameters, extremely rounded corners.
// ============================================================================
export function ModelDropdownV1(props: ModelDropdownTestProps) {
    const [isOpen, setIsOpen] = useState(false)
    const { triggerRef, panelRef, panelStyle } = useDropdown(isOpen, setIsOpen)
    const activeModel = props.models.find(m => m.value === props.value)
    const summary = resolveParamSummary(props.capabilityFields, props.capabilityOverrides)

    return (
        <>
            <button
                ref={triggerRef}
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center justify-between w-full h-[46px] px-4 rounded-[14px] transition-all duration-300 bg-[var(--glass-bg-surface)] border border-[var(--glass-stroke-subtle)] hover:bg-[var(--glass-bg-surface-strong)] ${isOpen ? 'ring-2 ring-black/10 dark:ring-white/20' : ''}`}
            >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="font-semibold text-[14px] text-[var(--glass-text-primary)]">
                        {activeModel ? activeModel.label : props.placeholder}
                    </span>
                    {activeModel?.providerName && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-[var(--glass-text-secondary)]">
                            {activeModel.providerName}
                        </span>
                    )}
                    {summary && <span className="text-[12px] text-[var(--glass-text-tertiary)] ml-auto pr-2">{summary}</span>}
                </div>
                <AppIcon name="chevronDown" className={`w-4 h-4 text-[var(--glass-text-tertiary)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && createPortal(
                <div ref={panelRef} style={panelStyle} className="glass-surface-modal rounded-[20px] shadow-[0_12px_40px_-10px_rgba(0,0,0,0.15)] border border-[var(--glass-stroke-subtle)] overflow-hidden flex flex-col backdrop-blur-2xl bg-white/70 dark:bg-black/70">
                    <div className="overflow-y-auto px-2 py-2 max-h-[220px]">
                        {props.models.map(m => {
                            const active = m.value === props.value
                            return (
                                <button
                                    key={m.value}
                                    onClick={() => props.onModelChange(m.value)}
                                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-[12px] mb-0.5 transition-all ${active ? 'bg-black text-white dark:bg-white dark:text-black shadow-md' : 'hover:bg-black/5 dark:hover:bg-white/10 text-[var(--glass-text-secondary)]'}`}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[14px] ${active ? 'font-bold' : 'font-medium'}`}>{m.label}</span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${active ? 'bg-white/20 text-white dark:bg-black/10 dark:text-black' : 'border border-[var(--glass-stroke-base)] text-[var(--glass-text-tertiary)]'}`}>
                                            {m.providerName}
                                        </span>
                                    </div>
                                    {active && <AppIcon name="check" className="w-4 h-4 ml-2" />}
                                </button>
                            )
                        })}
                    </div>
                    {props.capabilityFields.length > 0 && (
                        <div className="bg-black/5 dark:bg-white/5 border-t border-[var(--glass-stroke-subtle)] p-3 space-y-3">
                            {props.capabilityFields.map(field => {
                                const val = props.capabilityOverrides[field.field] !== undefined ? String(props.capabilityOverrides[field.field]) : String(field.options[0] || '')
                                return (
                                    <div key={field.field} className="flex items-center justify-between">
                                        <span className="text-[12px] font-semibold text-[var(--glass-text-secondary)]">{field.label || field.field}</span>
                                        <div className="flex bg-black/5 dark:bg-white/10 p-0.5 rounded-[10px]">
                                            {field.options.map((opt) => {
                                                const s = String(opt)
                                                const active = s === val
                                                return (
                                                    <button
                                                        key={s}
                                                        onClick={() => props.onCapabilityChange(field.field, s, field.options[0])}
                                                        className={`px-3 py-1 text-[12px] font-medium rounded-[8px] transition-all ${active ? 'bg-white dark:bg-[#333] shadow-sm text-[var(--glass-text-primary)]' : 'text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)]'}`}
                                                    >
                                                        {s}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>, document.body
            )}
        </>
    )
}

// ============================================================================
// Variant 2: Minimalist Tech Borderless (Vercel Style)
// Sharp, thin borders, hover states very subtle, focus on typography
// ============================================================================
export function ModelDropdownV2(props: ModelDropdownTestProps) {
    const [isOpen, setIsOpen] = useState(false)
    const { triggerRef, panelRef, panelStyle } = useDropdown(isOpen, setIsOpen)
    const activeModel = props.models.find(m => m.value === props.value)
    const summary = resolveParamSummary(props.capabilityFields, props.capabilityOverrides)

    return (
        <>
            <button
                ref={triggerRef}
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center justify-between w-full h-[40px] px-3 rounded-md transition-colors bg-[var(--glass-bg-surface)] border ${isOpen ? 'border-[var(--glass-text-primary)]' : 'border-[var(--glass-stroke-base)] hover:border-[var(--glass-text-secondary)]'}`}
            >
                <div className="flex items-baseline gap-2 truncate">
                    <span className="font-medium text-[13px] text-[var(--glass-text-primary)]">
                        {activeModel ? activeModel.label : props.placeholder}
                    </span>
                    <span className="text-[11px] text-[var(--glass-text-tertiary)]">
                        {summary ? `— ${summary}` : ''}
                    </span>
                </div>
                <AppIcon name="chevronDown" className={`w-3.5 h-3.5 text-[var(--glass-text-secondary)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && createPortal(
                <div ref={panelRef} style={panelStyle} className="glass-surface-modal rounded-md shadow-[0_4px_16px_rgba(0,0,0,0.1)] border border-[var(--glass-stroke-base)] overflow-hidden flex flex-col bg-[var(--glass-bg-surface-strong)]">
                    <div className="overflow-y-auto max-h-[200px]">
                        {props.models.map(m => {
                            const active = m.value === props.value
                            return (
                                <button
                                    key={m.value}
                                    onClick={() => props.onModelChange(m.value)}
                                    className={`w-full flex items-center justify-between px-3 py-2 text-left group ${active ? 'bg-[var(--glass-bg-active)]' : 'hover:bg-[var(--glass-bg-hover)]'}`}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[13px] ${active ? 'text-[var(--glass-text-primary)] font-medium' : 'text-[var(--glass-text-secondary)]'}`}>{m.label}</span>
                                        {m.providerName && (
                                            <span className="text-[10px] text-[var(--glass-text-tertiary)]">{m.providerName}</span>
                                        )}
                                    </div>
                                    {active && <AppIcon name="check" className="w-3.5 h-3.5 text-[var(--glass-text-primary)]" />}
                                </button>
                            )
                        })}
                    </div>
                    {props.capabilityFields.length > 0 && (
                        <div className="border-t border-[var(--glass-stroke-base)] bg-[var(--glass-bg-base)]">
                            {props.capabilityFields.map(field => {
                                const val = props.capabilityOverrides[field.field] !== undefined ? String(props.capabilityOverrides[field.field]) : String(field.options[0] || '')
                                return (
                                    <div key={field.field} className="flex flex-col border-b last:border-0 border-[var(--glass-stroke-subtle)]">
                                        <div className="px-3 pt-2 text-[10px] tracking-wider uppercase text-[var(--glass-text-tertiary)] font-semibold">{field.label || field.field}</div>
                                        <div className="flex px-2 pb-2 mt-1 flex-wrap gap-1">
                                            {field.options.map((opt) => {
                                                const s = String(opt)
                                                const active = s === val
                                                return (
                                                    <button
                                                        key={s}
                                                        onClick={() => props.onCapabilityChange(field.field, s, field.options[0])}
                                                        className={`min-w-[40px] px-2 py-1 text-[11px] font-mono rounded transition-colors ${active ? 'bg-[var(--glass-text-primary)] text-[var(--glass-bg-base)]' : 'bg-transparent text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-hover)] box-border border border-transparent'}`}
                                                    >
                                                        {s}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>, document.body
            )}
        </>
    )
}

// ============================================================================
// Variant 3: Neon / Playful Flow (Gradient accents, expressive)
// Premium AI feeling with slight accent colors and generous padding
// ============================================================================
export function ModelDropdownV3(props: ModelDropdownTestProps) {
    const [isOpen, setIsOpen] = useState(false)
    const { triggerRef, panelRef, panelStyle } = useDropdown(isOpen, setIsOpen)
    const activeModel = props.models.find(m => m.value === props.value)
    const summary = resolveParamSummary(props.capabilityFields, props.capabilityOverrides)

    return (
        <>
            <button
                ref={triggerRef}
                onClick={() => setIsOpen(!isOpen)}
                className={`relative flex items-center justify-between w-full h-[54px] px-4 rounded-[16px] transition-all duration-300 overflow-hidden group bg-[var(--glass-bg-surface)] backdrop-blur-xl ${isOpen ? 'shadow-[0_0_0_2px_#3B82F6]' : 'hover:shadow-[0_4px_24px_rgba(0,0,0,0.05)] border border-[var(--glass-stroke-base)]'}`}
            >
                {isOpen && <div className="absolute inset-0 bg-blue-500/5 transition-opacity duration-300" />}
                <div className="relative flex flex-col items-start min-w-0 pr-4 z-10">
                    <div className="flex items-center gap-2 w-full">
                        <span className="font-bold text-[15px] truncate text-[var(--glass-text-primary)]" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {activeModel ? activeModel.label : props.placeholder}
                        </span>
                        {activeModel?.providerName && (
                            <span className="px-1.5 py-0.5 rounded border border-[var(--glass-stroke-base)] text-[10px] text-[var(--glass-text-tertiary)] uppercase tracking-wider">
                                {activeModel.providerName}
                            </span>
                        )}
                    </div>
                    {summary && <span className="text-[12px] mt-0.5 font-medium text-blue-500 dark:text-blue-400 opacity-80">{summary}</span>}
                </div>
                <div className="relative w-8 h-8 rounded-full bg-[var(--glass-bg-muted)] flex items-center justify-center shrink-0 group-hover:bg-[var(--glass-bg-surface-strong)] transition-colors z-10">
                    <AppIcon name="chevronDown" className={`w-4 h-4 text-[var(--glass-text-secondary)] transition-transform duration-300 ${isOpen ? 'rotate-180 text-blue-500' : ''}`} />
                </div>
            </button>

            {isOpen && createPortal(
                <div ref={panelRef} style={panelStyle} className="glass-surface-modal rounded-[20px] shadow-[0_24px_48px_rgba(0,0,0,0.2)] border border-[var(--glass-stroke-base)] flex flex-col bg-gradient-to-br from-[var(--glass-bg-surface-strong)] to-[var(--glass-bg-surface)] backdrop-blur-3xl overflow-hidden">
                    <div className="overflow-y-auto max-h-[220px] p-2 space-y-1">
                        {props.models.map(m => {
                            const active = m.value === props.value
                            return (
                                <button
                                    key={m.value}
                                    onClick={() => props.onModelChange(m.value)}
                                    className={`w-full flex items-center px-4 py-3 rounded-xl transition-all ${active ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg' : 'hover:bg-[var(--glass-bg-hover)] text-[var(--glass-text-secondary)]'}`}
                                >
                                    <div className="w-5 h-5 mr-3 shrink-0 flex items-center justify-center">
                                        {active ? <AppIcon name="check" className="w-4 h-4 text-white" /> : <div className="w-1.5 h-1.5 rounded-full bg-[var(--glass-text-tertiary)] opacity-30" />}
                                    </div>
                                    <span className={`text-[14px] flex-1 text-left ${active ? 'font-bold' : 'font-medium'}`}>{m.label}</span>
                                </button>
                            )
                        })}
                    </div>
                    {props.capabilityFields.length > 0 && (
                        <div className="p-4 border-t border-[var(--glass-stroke-subtle)] bg-black/5 dark:bg-white/5 space-y-4">
                            {props.capabilityFields.map(field => {
                                const val = props.capabilityOverrides[field.field] !== undefined ? String(props.capabilityOverrides[field.field]) : String(field.options[0] || '')
                                return (
                                    <div key={field.field} className="flex flex-col gap-2">
                                        <div className="text-[13px] font-semibold text-[var(--glass-text-primary)]">{field.label || field.field}</div>
                                        <div className="flex flex-wrap gap-2">
                                            {field.options.map((opt) => {
                                                const s = String(opt)
                                                const active = s === val
                                                return (
                                                    <button
                                                        key={s}
                                                        onClick={() => props.onCapabilityChange(field.field, s, field.options[0])}
                                                        className={`px-4 py-1.5 rounded-full text-[12px] font-bold transition-all border ${active ? 'bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400' : 'bg-transparent border-[var(--glass-stroke-base)] text-[var(--glass-text-secondary)] hover:border-[var(--glass-text-tertiary)]'}`}
                                                    >
                                                        {s}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>, document.body
            )}
        </>
    )
}

// ============================================================================
// Variant 4: Card Overlay (Like the original photo, but beautifully refined)
// Dual-tone top and bottom, very clear visual hierarchy.
// ============================================================================
export function ModelDropdownV4(props: ModelDropdownTestProps) {
    const [isOpen, setIsOpen] = useState(false)
    const { triggerRef, panelRef, panelStyle } = useDropdown(isOpen, setIsOpen)
    const activeModel = props.models.find(m => m.value === props.value)

    // Convert to what original had: e.g. "2 · 720p"
    const summary = resolveParamSummary(props.capabilityFields, props.capabilityOverrides)

    return (
        <>
            <button
                ref={triggerRef}
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center justify-between w-full h-[50px] px-4 rounded-[12px] bg-[var(--glass-bg-surface)] border transition-shadow duration-200 ${isOpen ? 'border-[#8B5CF6] shadow-[0_0_0_4px_rgba(139,92,246,0.15)] ring-0' : 'border-[var(--glass-stroke-base)] hover:border-gray-400 dark:hover:border-gray-500'}`}
            >
                <div className="flex items-center gap-3">
                    <span className="font-semibold text-[15px] text-[var(--glass-text-primary)]">{activeModel ? activeModel.label : props.placeholder}</span>
                    {activeModel?.providerName && (
                        <span className="px-2 py-0.5 rounded-[6px] border border-[var(--glass-stroke-subtle)] text-[11px] text-[var(--glass-text-secondary)] bg-[var(--glass-bg-base)] shadow-sm">
                            {activeModel.providerName}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    {summary && <span className="font-medium text-[13px] text-[var(--glass-text-secondary)]">{summary}</span>}
                    <AppIcon name="chevronDown" className={`w-4 h-4 text-[var(--glass-text-tertiary)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            </button>

            {isOpen && createPortal(
                <div ref={panelRef} style={panelStyle} className="glass-surface-modal rounded-[16px] shadow-[0_16px_50px_rgba(0,0,0,0.12)] border border-[var(--glass-stroke-base)] overflow-hidden flex flex-col bg-white dark:bg-[#1C1C1E]">
                    {/* Top: Models */}
                    <div className="px-3 pt-3 pb-2 bg-[var(--glass-bg-base)]">
                        <div className="text-[12px] font-bold text-[var(--glass-text-secondary)] mb-2 px-1">选择模型</div>
                        <div className="overflow-y-auto max-h-[160px] custom-scrollbar space-y-1 pr-1">
                            {props.models.map(m => {
                                const active = m.value === props.value
                                return (
                                    <button
                                        key={m.value}
                                        onClick={() => props.onModelChange(m.value)}
                                        className={`w-full flex items-center px-3 py-2.5 rounded-[10px] transition-all border ${active ? 'bg-blue-50/50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'bg-transparent border-transparent hover:bg-black/5 dark:hover:bg-white/5'}`}
                                    >
                                        <span className={`text-[14px] flex-1 text-left ${active ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-[var(--glass-text-primary)] font-medium'}`}>{m.label}</span>
                                        {m.providerName && (
                                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-black/5 dark:bg-white/10 text-[var(--glass-text-secondary)] ml-2">{m.providerName}</span>
                                        )}
                                        {active && <div className="w-1.5 h-6 rounded-full bg-blue-500 ml-3" />}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                    {/* Bottom: Settings */}
                    {props.capabilityFields.length > 0 && (
                        <div className="p-4 bg-[var(--glass-bg-surface)] border-t border-[var(--glass-stroke-subtle)] space-y-4">
                            <div className="text-[12px] font-bold text-[var(--glass-text-secondary)]">参数配置</div>
                            {props.capabilityFields.map(field => {
                                const val = props.capabilityOverrides[field.field] !== undefined ? String(props.capabilityOverrides[field.field]) : String(field.options[0] || '')

                                // To mimic the "duration using select, ratio using pill" behaviour from the original
                                const useSelectBox = field.options.every(o => typeof o === 'number') || field.field.toLowerCase().includes('duration')

                                return (
                                    <div key={field.field} className="flex items-center justify-between gap-4">
                                        <span className="text-[14px] text-[var(--glass-text-primary)] font-medium shrink-0">{field.label || field.field}</span>

                                        {useSelectBox ? (
                                            <div className="relative w-[120px]">
                                                <select
                                                    value={val}
                                                    onChange={e => props.onCapabilityChange(field.field, e.target.value, field.options[0])}
                                                    className="w-full h-[36px] appearance-none bg-[var(--glass-bg-base)] border border-[var(--glass-stroke-base)] rounded-[8px] px-3 font-medium text-[13px] text-[var(--glass-text-primary)] focus:outline-none focus:border-blue-500"
                                                >
                                                    {field.options.map(opt => <option key={String(opt)} value={String(opt)}>{opt}</option>)}
                                                </select>
                                                <AppIcon name="chevronDown" className="w-4 h-4 text-[var(--glass-text-tertiary)] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                            </div>
                                        ) : (
                                            <div className="flex bg-[var(--glass-bg-base)] p-[3px] rounded-[10px] border border-[var(--glass-stroke-subtle)]">
                                                {field.options.map((opt) => {
                                                    const s = String(opt)
                                                    const active = s === val
                                                    return (
                                                        <button
                                                            key={s}
                                                            onClick={() => props.onCapabilityChange(field.field, s, field.options[0])}
                                                            className={`px-3 py-1.5 text-[13px] font-medium rounded-[7px] transition-all min-w-[50px] text-center ${active ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 shadow-sm' : 'text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] hover:bg-black/5 dark:hover:bg-white/5'}`}
                                                        >
                                                            {s}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>, document.body
            )}
        </>
    )
}

// ============================================================================
// Variant 5: Ultra-Minimal Inline Flat
// No explicit boxes for the dropdown fields. A seamless, document-like feel.
// ============================================================================
export function ModelDropdownV5(props: ModelDropdownTestProps) {
    const [isOpen, setIsOpen] = useState(false)
    const { triggerRef, panelRef, panelStyle } = useDropdown(isOpen, setIsOpen)
    const activeModel = props.models.find(m => m.value === props.value)
    const summary = resolveParamSummary(props.capabilityFields, props.capabilityOverrides)

    return (
        <>
            <button
                ref={triggerRef}
                onClick={() => setIsOpen(!isOpen)}
                className={`group flex flex-col justify-center w-full px-2 py-2 rounded-lg transition-all border-b-2 ${isOpen ? 'border-[#FCA5A5] bg-[var(--glass-bg-hover)]' : 'border-transparent hover:border-[var(--glass-stroke-base)] hover:bg-[var(--glass-bg-surface)]'}`}
            >
                <div className="flex items-center gap-2 w-full">
                    <span className="font-semibold text-[16px] text-[var(--glass-text-primary)]">
                        {activeModel ? activeModel.label : props.placeholder}
                    </span>
                    <AppIcon name="chevronDown" className={`w-4 h-4 text-[var(--glass-text-tertiary)] ml-auto transition-transform ${isOpen ? 'rotate-180 text-[#FCA5A5]' : 'group-hover:text-[var(--glass-text-primary)]'}`} />
                </div>
                <div className="flex items-center gap-2 mt-1 opacity-70">
                    <span className="text-[12px] text-[var(--glass-text-tertiary)] font-mono uppercase">
                        {activeModel?.providerName || 'MODEL'}
                    </span>
                    {summary && (
                        <>
                            <span className="w-1 h-1 rounded-full bg-gray-400" />
                            <span className="text-[12px] text-[var(--glass-text-secondary)]">{summary}</span>
                        </>
                    )}
                </div>
            </button>

            {isOpen && createPortal(
                <div ref={panelRef} style={panelStyle} className="glass-surface-modal rounded-xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-base)] overflow-hidden flex flex-col">
                    <div className="flex-1 overflow-y-auto max-h-[200px] p-2">
                        {props.models.map(m => {
                            const active = m.value === props.value
                            return (
                                <button
                                    key={m.value}
                                    onClick={() => props.onModelChange(m.value)}
                                    className={`relative flex items-center w-full px-4 py-3 rounded-lg text-left transition-colors mb-1 overflow-hidden ${active ? 'bg-[#FCA5A5]/10' : 'hover:bg-[var(--glass-bg-surface-strong)]'}`}
                                >
                                    {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-[#FCA5A5] rounded-r-md" />}
                                    <span className={`text-[15px] flex-1 ${active ? 'text-[#FCA5A5] font-bold' : 'text-[var(--glass-text-primary)] font-medium'}`}>{m.label}</span>
                                    {m.providerName && (
                                        <span className="text-[11px] font-mono text-[var(--glass-text-tertiary)] bg-[var(--glass-bg-surface)] px-2 py-0.5 rounded">{m.providerName}</span>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                    {props.capabilityFields.length > 0 && (
                        <div className="p-4 bg-[var(--glass-bg-surface-strong)] border-t border-[var(--glass-stroke-base)] space-y-4">
                            {props.capabilityFields.map(field => {
                                const val = props.capabilityOverrides[field.field] !== undefined ? String(props.capabilityOverrides[field.field]) : String(field.options[0] || '')
                                return (
                                    <div key={field.field} className="flex flex-col gap-2">
                                        <span className="text-[11px] uppercase tracking-widest font-bold text-[var(--glass-text-tertiary)]">{field.label || field.field}</span>
                                        <div className="flex gap-2">
                                            {field.options.map((opt) => {
                                                const s = String(opt)
                                                const active = s === val
                                                return (
                                                    <button
                                                        key={s}
                                                        onClick={() => props.onCapabilityChange(field.field, s, field.options[0])}
                                                        className={`flex-1 py-1.5 text-[13px] font-semibold rounded-md border-b-2 transition-all ${active ? 'border-[#FCA5A5] text-[#FCA5A5] bg-[#FCA5A5]/5' : 'border-transparent text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-hover)]'}`}
                                                    >
                                                        {s}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>, document.body
            )}
        </>
    )
}
