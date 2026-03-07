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

function useDropdown(isOpen: boolean, setIsOpen: (val: boolean) => void, alignRight: boolean = false) {
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

        const width = Math.max(rect.width, 240)
        let left = rect.left
        if (alignRight) {
            left = rect.right - width
        }

        setPanelStyle({
            position: 'fixed',
            left,
            width,
            maxHeight: currentMaxHeight,
            ...(openUpward
                ? { bottom: viewportHeight - rect.top + 6 }
                : { top: rect.bottom + 6 }),
            zIndex: 9999
        })
    }, [alignRight])

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
// V6: The Split Toolbar (Deconstructed Controls)
// Breaks the monolithic dropdown into two separate context actions. No massive popover.
// ============================================================================
export function ModelInnovativeV6(props: ModelDropdownTestProps) {
    const [modelOpen, setModelOpen] = useState(false)
    const [paramOpen, setParamOpen] = useState(false)

    const { triggerRef: modelTrigger, panelRef: modelPanel, panelStyle: modelStyle } = useDropdown(modelOpen, setModelOpen)
    const { triggerRef: paramTrigger, panelRef: paramPanel, panelStyle: paramStyle } = useDropdown(paramOpen, setParamOpen, true)

    const activeModel = props.models.find(m => m.value === props.value)
    const summary = resolveParamSummary(props.capabilityFields, props.capabilityOverrides)

    return (
        <div className="flex items-center bg-[var(--glass-bg-surface)] border border-[var(--glass-stroke-base)] rounded-xl shadow-sm backdrop-blur-md">
            {/* Left Button: Model Selection */}
            <button
                ref={modelTrigger}
                onClick={() => { setModelOpen(!modelOpen); setParamOpen(false) }}
                className={`flex-1 flex items-center justify-between px-4 py-3 transition-colors rounded-l-xl hover:bg-black/5 dark:hover:bg-white/5 ${modelOpen ? 'bg-black/5 dark:bg-white/5' : ''}`}
            >
                <div className="flex flex-col items-start min-w-0 pr-2">
                    <span className="text-[11px] font-bold text-[var(--glass-text-tertiary)] uppercase tracking-wider mb-0.5">模型 Model</span>
                    <span className="text-[14px] font-semibold text-[var(--glass-text-primary)] truncate">
                        {activeModel ? activeModel.label : props.placeholder}
                    </span>
                </div>
                <AppIcon name="chevronDown" className="w-4 h-4 text-[var(--glass-text-tertiary)] shrink-0" />
            </button>

            {/* Divider */}
            <div className="w-[1px] h-10 bg-[var(--glass-stroke-base)]" />

            {/* Right Button: Param Configuration */}
            <button
                ref={paramTrigger}
                onClick={() => { setParamOpen(!paramOpen); setModelOpen(false) }}
                className={`flex-1 flex items-center justify-between px-4 py-3 transition-colors rounded-r-xl hover:bg-black/5 dark:hover:bg-white/5 ${paramOpen ? 'bg-black/5 dark:bg-white/5' : ''}`}
                disabled={props.capabilityFields.length === 0}
            >
                <div className="flex flex-col items-start min-w-0 pr-2">
                    <span className="text-[11px] font-bold text-[var(--glass-text-tertiary)] uppercase tracking-wider mb-0.5">参数 Params</span>
                    <span className={`text-[14px] font-semibold truncate ${props.capabilityFields.length === 0 ? 'text-[var(--glass-text-tertiary)]' : 'text-blue-500'}`}>
                        {props.capabilityFields.length === 0 ? '不可配置' : (summary || '配置')}
                    </span>
                </div>
                <AppIcon name="chevronDown" className="w-4 h-4 text-[var(--glass-text-tertiary)] shrink-0" />
            </button>

            {/* Portals */}
            {modelOpen && createPortal(
                <div ref={modelPanel} style={modelStyle} className="glass-surface-modal rounded-xl shadow-lg border border-[var(--glass-stroke-base)] p-2">
                    {props.models.map(m => (
                        <button
                            key={m.value}
                            onClick={() => { props.onModelChange(m.value); setModelOpen(false) }}
                            className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[var(--glass-bg-hover)] flex items-center justify-between transition-colors"
                        >
                            <span className="text-[14px] font-medium text-[var(--glass-text-primary)]">{m.label}</span>
                            {m.value === props.value && <AppIcon name="check" className="w-4 h-4 text-blue-500" />}
                        </button>
                    ))}
                </div>, document.body
            )}
            {paramOpen && props.capabilityFields.length > 0 && createPortal(
                <div ref={paramPanel} style={paramStyle} className="glass-surface-modal rounded-xl shadow-lg border border-[var(--glass-stroke-base)] p-4 space-y-4">
                    {props.capabilityFields.map(field => {
                        const val = props.capabilityOverrides[field.field] !== undefined ? String(props.capabilityOverrides[field.field]) : String(field.options[0] || '')
                        return (
                            <div key={field.field}>
                                <div className="text-[12px] font-medium text-[var(--glass-text-secondary)] mb-2">{field.label || field.field}</div>
                                <div className="flex gap-2">
                                    {field.options.map(opt => {
                                        const s = String(opt)
                                        const active = s === val
                                        return (
                                            <button
                                                key={s}
                                                onClick={() => props.onCapabilityChange(field.field, s, field.options[0])}
                                                className={`flex-1 px-2 py-1.5 text-[13px] rounded-lg transition-colors border ${active ? 'bg-blue-50/50 dark:bg-blue-900/30 border-blue-500 text-blue-600 dark:text-blue-400 font-semibold' : 'bg-transparent border-[var(--glass-stroke-base)] text-[var(--glass-text-secondary)] hover:hover:bg-[var(--glass-bg-hover)]'}`}
                                            >
                                                {s}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        )
                    })}
                </div>, document.body
            )}
        </div>
    )
}

// ============================================================================
// V7: The Inline Canvas Expandable (No Overlays, Document Flow)
// Pushes content down naturally. Perfect for form wizards.
// ============================================================================
export function ModelInnovativeV7(props: ModelDropdownTestProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const activeModel = props.models.find(m => m.value === props.value)

    return (
        <div className="bg-[var(--glass-bg-surface-strong)] rounded-2xl border border-[var(--glass-stroke-subtle)] overflow-hidden transition-all duration-300 shadow-sm">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-4 bg-transparent outline-none focus:outline-none"
            >
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400">
                        <AppIcon name="cpu" className="w-5 h-5" />
                    </div>
                    <div className="text-left flex flex-col">
                        <span className="text-[15px] font-bold text-[var(--glass-text-primary)]">
                            {activeModel ? activeModel.label : '未选择模型'}
                        </span>
                        <span className="text-[12px] text-[var(--glass-text-tertiary)] mt-0.5">
                            展开以修改模型或参数设置
                        </span>
                    </div>
                </div>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-[var(--glass-bg-muted)] transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                    <AppIcon name="chevronDown" className="w-4 h-4 text-[var(--glass-text-secondary)]" />
                </div>
            </button>

            <div className={`transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'} overflow-hidden`}>
                <div className="p-4 pt-0 border-t border-[var(--glass-stroke-base)] mt-2 mx-4">
                    <div className="mt-4 mb-2 text-[12px] font-bold uppercase tracking-wider text-[var(--glass-text-secondary)]">1. 选择模型</div>
                    <div className="grid grid-cols-2 gap-2 mb-6">
                        {props.models.map(m => {
                            const active = m.value === props.value
                            return (
                                <button
                                    key={m.value}
                                    onClick={() => props.onModelChange(m.value)}
                                    className={`p-3 text-left rounded-xl transition-colors border ${active ? 'bg-blue-50/80 dark:bg-blue-900/40 border-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.15)]' : 'bg-[var(--glass-bg-base)] border-[var(--glass-stroke-base)] hover:border-[var(--glass-stroke-active)]'}`}
                                >
                                    <div className={`text-[13px] font-semibold mb-1 ${active ? 'text-blue-600 dark:text-blue-400' : 'text-[var(--glass-text-primary)]'}`}>{m.label}</div>
                                    {m.providerName && <div className="text-[10px] text-[var(--glass-text-tertiary)]">{m.providerName}</div>}
                                </button>
                            )
                        })}
                    </div>

                    {props.capabilityFields.length > 0 && (
                        <>
                            <div className="mb-2 text-[12px] font-bold uppercase tracking-wider text-[var(--glass-text-secondary)]">2. 参数微调</div>
                            <div className="space-y-4 bg-[var(--glass-bg-base)] p-4 rounded-xl border border-[var(--glass-stroke-subtle)]">
                                {props.capabilityFields.map(field => {
                                    const val = props.capabilityOverrides[field.field] !== undefined ? String(props.capabilityOverrides[field.field]) : String(field.options[0] || '')
                                    return (
                                        <div key={field.field} className="flex items-center justify-between gap-4">
                                            <span className="text-[13px] font-medium text-[var(--glass-text-primary)] shrink-0">{field.label || field.field}</span>
                                            <div className="flex flex-wrap gap-2 justify-end">
                                                {field.options.map(opt => {
                                                    const s = String(opt)
                                                    const active = s === val
                                                    return (
                                                        <button
                                                            key={s}
                                                            onClick={() => props.onCapabilityChange(field.field, s, field.options[0])}
                                                            className={`px-3 py-1 text-[12px] transition-all rounded-md ${active ? 'bg-[var(--glass-text-primary)] text-[var(--glass-bg-base)] shadow-md font-bold' : 'bg-[var(--glass-bg-surface-strong)] text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-hover)]'}`}
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
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

// ============================================================================
// V8: The Pro Centered Modal (Context Shift)
// Clicking opens a spacious, distraction-free modal dialog. Left-right layout.
// ============================================================================
export function ModelInnovativeV8(props: ModelDropdownTestProps) {
    const [isOpen, setIsOpen] = useState(false)
    const activeModel = props.models.find(m => m.value === props.value)

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="w-full flex items-center justify-between px-5 py-3 rounded-xl bg-[var(--glass-bg-surface)] border border-[var(--glass-stroke-base)] hover:shadow-md transition-shadow"
            >
                <div className="flex items-center gap-3">
                    <AppIcon name="settingsHex" className="w-5 h-5 text-[var(--glass-text-secondary)]" />
                    <span className="text-[15px] font-medium text-[var(--glass-text-primary)]">
                        {activeModel ? activeModel.label : '配置模型...'}
                    </span>
                </div>
                <div className="text-[12px] font-bold text-blue-500 bg-blue-500/10 px-3 py-1 rounded-full uppercase tracking-widest">
                    编辑
                </div>
            </button>

            {isOpen && createPortal(
                <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
                    <div className="relative w-full max-w-3xl h-[500px] flex rounded-2xl bg-[var(--glass-bg-base)] border border-[var(--glass-stroke-subtle)] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        {/* Left: Models List */}
                        <div className="w-1/2 flex flex-col border-r border-[var(--glass-stroke-subtle)] bg-[var(--glass-bg-surface)]">
                            <div className="p-5 border-b border-[var(--glass-stroke-subtle)] flex items-center justify-between">
                                <h2 className="text-[18px] font-bold text-[var(--glass-text-primary)]">模型库</h2>
                                <span className="text-[12px] text-[var(--glass-text-tertiary)]">包含 {props.models.length} 项</span>
                            </div>
                            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                                {props.models.map(m => {
                                    const active = m.value === props.value
                                    return (
                                        <button
                                            key={m.value}
                                            onClick={() => props.onModelChange(m.value)}
                                            className={`w-full text-left p-4 rounded-xl transition-colors border ${active ? 'bg-blue-500 shadow-[0_4px_12px_rgba(59,130,246,0.3)] border-transparent' : 'bg-transparent border-transparent hover:bg-black/5 dark:hover:bg-white/5'}`}
                                        >
                                            <div className={`text-[15px] font-bold ${active ? 'text-white' : 'text-[var(--glass-text-primary)]'}`}>{m.label}</div>
                                            {m.providerName && <div className={`text-[12px] mt-1 ${active ? 'text-blue-100' : 'text-[var(--glass-text-tertiary)]'}`}>{m.providerName}</div>}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                        {/* Right: Params Configuration */}
                        <div className="w-1/2 flex flex-col bg-[var(--glass-bg-base)]">
                            <div className="p-5 border-b border-[var(--glass-stroke-subtle)] flex items-center justify-between">
                                <h2 className="text-[18px] font-bold text-[var(--glass-text-primary)]">参数设置</h2>
                                <button onClick={() => setIsOpen(false)} className="p-1 rounded-full hover:bg-[var(--glass-bg-hover)]">
                                    <AppIcon name="close" className="w-5 h-5 text-[var(--glass-text-secondary)]" />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-6 space-y-8">
                                {props.capabilityFields.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-center text-[var(--glass-text-tertiary)] gap-4 opacity-70">
                                        <AppIcon name="info" className="w-10 h-10" />
                                        <p>当前模型无可用参数</p>
                                    </div>
                                ) : (
                                    props.capabilityFields.map(field => {
                                        const val = props.capabilityOverrides[field.field] !== undefined ? String(props.capabilityOverrides[field.field]) : String(field.options[0] || '')
                                        return (
                                            <div key={field.field} className="space-y-4">
                                                <div className="text-[14px] font-bold text-[var(--glass-text-secondary)] uppercase tracking-widest">{field.label || field.field}</div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    {field.options.map(opt => {
                                                        const s = String(opt)
                                                        const active = s === val
                                                        return (
                                                            <button
                                                                key={s}
                                                                onClick={() => props.onCapabilityChange(field.field, s, field.options[0])}
                                                                className={`p-3 text-[14px] text-center rounded-xl transition-all border ${active ? 'bg-[var(--glass-text-primary)] text-[var(--glass-bg-base)] border-[var(--glass-text-primary)]' : 'bg-transparent text-[var(--glass-text-primary)] border-[var(--glass-stroke-base)] hover:border-[var(--glass-stroke-active)]'}`}
                                                            >
                                                                {s}
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                            <div className="p-4 border-t border-[var(--glass-stroke-subtle)] bg-[var(--glass-bg-surface-strong)] flex justify-end">
                                <button onClick={() => setIsOpen(false)} className="px-6 py-2.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-500 shadow-md">
                                    确认应用
                                </button>
                            </div>
                        </div>
                    </div>
                </div>, document.body
            )}
        </>
    )
}

// ============================================================================
// V9: The Drill-Down Popover (Nested Navigation)
// Click Model -> Popover shows Model List -> Click "Params" -> View shifts sideways inside popover.
// ============================================================================
export function ModelInnovativeV9(props: ModelDropdownTestProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [view, setView] = useState<'models' | 'params'>('models')
    const { triggerRef, panelRef, panelStyle } = useDropdown(isOpen, setIsOpen)
    const activeModel = props.models.find(m => m.value === props.value)

    // When re-opening, reset view
    useEffect(() => {
        if (isOpen) setView('models')
    }, [isOpen])

    return (
        <>
            <button
                ref={triggerRef}
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center justify-between w-full p-2 rounded-lg bg-[var(--glass-bg-surface)] border ${isOpen ? 'border-[#ff6b6b] ring-1 ring-[#ff6b6b]/20 shadow-[0_4px_16px_rgba(255,107,107,0.1)]' : 'border-[var(--glass-stroke-base)] group hover:border-[var(--glass-stroke-active)]'}`}
            >
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded shrink-0 bg-[#ff6b6b]/10 flex items-center justify-center">
                        <AppIcon name="sparkles" className="w-4 h-4 text-[#ff6b6b]" />
                    </div>
                    <div className="flex flex-col text-left">
                        <span className="text-[13px] font-semibold text-[var(--glass-text-primary)]">{activeModel ? activeModel.label : '未选择'}</span>
                        <span className="text-[11px] text-[var(--glass-text-tertiary)]">{props.capabilityFields.length} 项参数配置可设</span>
                    </div>
                </div>
                <AppIcon name="chevronDown" className="w-4 h-4 mr-1 text-[var(--glass-text-tertiary)] transition-transform group-hover:text-[var(--glass-text-primary)]" />
            </button>

            {isOpen && createPortal(
                <div ref={panelRef} style={panelStyle} className="glass-surface-modal rounded-xl shadow-xl border border-[var(--glass-stroke-subtle)] overflow-hidden bg-[var(--glass-bg-base)]">
                    <div className={`flex w-[200%] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${view === 'params' ? '-translate-x-1/2' : 'translate-x-0'}`}>
                        {/* Page 1: Models */}
                        <div className="w-1/2 flex flex-col max-h-[300px]">
                            <div className="p-3 border-b border-[var(--glass-stroke-subtle)] bg-[var(--glass-bg-surface)] font-bold text-[13px] text-center">选择主要模型</div>
                            <div className="overflow-y-auto flex-1 p-2 space-y-1">
                                {props.models.map(m => {
                                    const active = m.value === props.value
                                    return (
                                        <div key={m.value} className="flex gap-1 group">
                                            <button
                                                onClick={() => props.onModelChange(m.value)}
                                                className={`flex-1 flex items-center px-3 py-2 rounded-lg text-left transition-colors ${active ? 'bg-[#ff6b6b]/10 text-[#ff6b6b] font-bold' : 'hover:bg-[var(--glass-bg-hover)] text-[var(--glass-text-primary)]'}`}
                                            >
                                                <span className="text-[13px]">{m.label}</span>
                                                {active && <AppIcon name="check" className="w-3.5 h-3.5 ml-auto" />}
                                            </button>
                                            {active && props.capabilityFields.length > 0 && (
                                                <button
                                                    onClick={() => setView('params')}
                                                    className="px-2 py-2 w-[40px] flex items-center justify-center rounded-lg bg-[var(--glass-bg-surface-strong)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-stroke-subtle)] text-[var(--glass-text-secondary)] shadow-sm"
                                                    title="配置参数"
                                                >
                                                    <AppIcon name="settingsHex" className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                        {/* Page 2: Params */}
                        <div className="w-1/2 flex flex-col max-h-[300px]">
                            <div className="p-2 border-b border-[var(--glass-stroke-subtle)] bg-[var(--glass-bg-surface)] flex items-center">
                                <button onClick={() => setView('models')} className="p-1 px-2 shrink-0 flex items-center gap-1 hover:bg-[var(--glass-bg-hover)] rounded font-medium text-[12px] text-[var(--glass-text-secondary)]">
                                    <AppIcon name="chevronDown" className="w-4 h-4 rotate-90" />
                                    返回
                                </button>
                                <div className="font-bold text-[13px] text-center flex-1 mr-8">参数配置</div>
                            </div>
                            <div className="overflow-y-auto flex-1 p-4 space-y-5">
                                {props.capabilityFields.map(field => {
                                    const val = props.capabilityOverrides[field.field] !== undefined ? String(props.capabilityOverrides[field.field]) : String(field.options[0] || '')
                                    return (
                                        <div key={field.field} className="space-y-2">
                                            <div className="text-[12px] font-semibold text-[var(--glass-text-secondary)]">{field.label || field.field}</div>
                                            <div className="grid grid-cols-1 gap-1.5">
                                                {field.options.map(opt => {
                                                    const s = String(opt)
                                                    const active = s === val
                                                    return (
                                                        <button
                                                            key={s}
                                                            onClick={() => props.onCapabilityChange(field.field, s, field.options[0])}
                                                            className={`w-full p-2 text-[12px] text-center rounded-md border transition-all ${active ? 'bg-[#ff6b6b] text-white border-[#ff6b6b]' : 'bg-[var(--glass-bg-surface-strong)] border-[var(--glass-stroke-base)] text-[var(--glass-text-primary)] hover:border-[var(--glass-stroke-active)]'}`}
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
                        </div>
                    </div>
                </div>, document.body
            )}
        </>
    )
}

// ============================================================================
// V10: Bottom Sheet Drawer (Mobile-inspired / Context Menu Bottom)
// Triggers a drawer anchored to the bottom of the screen. Very tactile.
// ============================================================================
export function ModelInnovativeV10(props: ModelDropdownTestProps) {
    const [isOpen, setIsOpen] = useState(false)
    const activeModel = props.models.find(m => m.value === props.value)

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-full bg-[var(--glass-bg-base)] border border-[var(--glass-text-primary)] hover:bg-[var(--glass-text-primary)] hover:text-[var(--glass-bg-base)] group transition-all text-[var(--glass-text-primary)] font-bold shadow-[0_4px_14px_rgba(0,0,0,0.1)]"
            >
                <AppIcon name="cpu" className="w-5 h-5 group-hover:animate-pulse" />
                <span>生成偏好: {activeModel ? activeModel.label : '点击选择'}</span>
            </button>

            {isOpen && createPortal(
                <div className="fixed inset-0 z-[99999] flex flex-col justify-end">
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-300"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="relative w-full max-w-4xl mx-auto bg-[var(--glass-bg-base)] border-t border-[var(--glass-stroke-active)] rounded-t-[32px] p-6 pb-12 shadow-[0_-10px_40px_rgba(0,0,0,0.2)] animate-in slide-in-from-bottom duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]">
                        <div className="w-12 h-1.5 bg-[var(--glass-stroke-active)] rounded-full mx-auto mb-6" />

                        <div className="flex justify-between items-center mb-6 px-2">
                            <h2 className="text-[24px] font-black text-[var(--glass-text-primary)] tracking-tight">配置生成偏好</h2>
                            <button onClick={() => setIsOpen(false)} className="w-10 h-10 rounded-full bg-[var(--glass-bg-surface-strong)] flex items-center justify-center hover:bg-[var(--glass-bg-hover)]">
                                <AppIcon name="close" className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex flex-col md:flex-row gap-8 px-2">
                            {/* Left: Models horizontally scrollable block */}
                            <div className="w-full md:w-2/3">
                                <h3 className="text-[14px] font-bold text-[var(--glass-text-secondary)] uppercase tracking-wider mb-4">核心模型选择</h3>
                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                                    {props.models.map(m => {
                                        const active = m.value === props.value
                                        return (
                                            <button
                                                key={m.value}
                                                onClick={() => props.onModelChange(m.value)}
                                                className={`flex flex-col items-start p-4 rounded-[20px] transition-all border-2 text-left ${active ? 'border-[#3B82F6] bg-[#3B82F6]/5 shadow-[0_8px_20px_rgba(59,130,246,0.1)]' : 'border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] hover:border-[var(--glass-stroke-active)]'}`}
                                            >
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${active ? 'bg-[#3B82F6] shadow-[0_4px_10px_rgba(59,130,246,0.3)]' : 'bg-[var(--glass-bg-base)] border border-[var(--glass-stroke-subtle)]'}`}>
                                                    <AppIcon name="sparkles" className={`w-5 h-5 ${active ? 'text-white' : 'text-[var(--glass-text-tertiary)]'}`} />
                                                </div>
                                                <span className={`text-[15px] font-bold leading-tight ${active ? 'text-[#3B82F6]' : 'text-[var(--glass-text-primary)]'}`}>{m.label}</span>
                                                {m.providerName && <span className="text-[11px] font-medium text-[var(--glass-text-tertiary)] mt-1">{m.providerName}</span>}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Right: Vertical params list */}
                            <div className="w-full md:w-1/3 flex flex-col pt-2 md:pt-0 border-t md:border-t-0 md:border-l border-[var(--glass-stroke-subtle)] md:pl-8">
                                <h3 className="text-[14px] font-bold text-[var(--glass-text-secondary)] uppercase tracking-wider mb-4">参数微调</h3>
                                {props.capabilityFields.length === 0 ? (
                                    <div className="text-[var(--glass-text-tertiary)] text-[14px]">自动最佳配置应用中</div>
                                ) : (
                                    <div className="space-y-6">
                                        {props.capabilityFields.map(field => {
                                            const val = props.capabilityOverrides[field.field] !== undefined ? String(props.capabilityOverrides[field.field]) : String(field.options[0] || '')
                                            return (
                                                <div key={field.field}>
                                                    <div className="text-[15px] font-bold text-[var(--glass-text-primary)] mb-3">{field.label || field.field}</div>
                                                    <div className="flex bg-[var(--glass-bg-surface-strong)] p-1.5 rounded-[16px]">
                                                        {field.options.map(opt => {
                                                            const s = String(opt)
                                                            const active = s === val
                                                            return (
                                                                <button
                                                                    key={s}
                                                                    onClick={() => props.onCapabilityChange(field.field, s, field.options[0])}
                                                                    className={`flex-1 py-2 text-[14px] font-bold rounded-[12px] transition-all ${active ? 'bg-white dark:bg-black text-[var(--glass-text-primary)] shadow-md' : 'text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)]'}`}
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
                            </div>
                        </div>
                    </div>
                </div>, document.body
            )}
        </>
    )
}
