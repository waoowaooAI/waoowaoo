'use client'

/**
 * ModelCapabilityDropdown - 方案 A 经典分区式
 * 自定义下拉组件：上半区选模型，分割线，下半区配参数
 * 触发器显示模型名 + provider + 参数摘要
 *
 * 用于：
 *  - 项目配置中心 (ConfigEditModal / SettingsModal)
 *  - 系统级设置中心 (ApiConfigTabContainer)
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { CapabilityValue } from '@/lib/model-config-contract'
import { AppIcon, RatioPreviewIcon } from '@/components/ui/icons'

// ─── Types ────────────────────────────────────────────

export interface ModelCapabilityOption {
    /** Composite key e.g. "ark::doubao-seedance-1-0-pro-250528" */
    value: string
    /** Display name */
    label: string
    /** Raw provider id */
    provider?: string
    /** Friendly provider name */
    providerName?: string
    /** Whether this model is disabled in current context */
    disabled?: boolean
}

export interface CapabilityFieldDefinition {
    field: string
    label: string
    options: CapabilityValue[]
    disabledOptions?: CapabilityValue[]
}

export interface CapabilityBooleanToggle {
    key: string
    label: string
    value: boolean
    onChange: (next: boolean) => void
    onLabel?: string
    offLabel?: string
}

export interface ModelCapabilityDropdownProps {
    /** Available model options */
    models: ModelCapabilityOption[]
    /** Currently selected model key */
    value: string | undefined
    /** Callback when model selection changes */
    onModelChange: (modelKey: string) => void
    /** Capability fields for the currently selected model */
    capabilityFields: CapabilityFieldDefinition[]
    /** Current capability override values keyed by field name */
    capabilityOverrides: Record<string, CapabilityValue>
    /** Callback when a capability value changes. Pass empty string to reset. */
    onCapabilityChange: (field: string, rawValue: string, sample: CapabilityValue) => void
    /** Optional: label text to show when no model is selected */
    placeholder?: string
    /** Optional: compact mode for smaller card contexts */
    compact?: boolean
    /** Optional: extra boolean toggles rendered in param section */
    booleanToggles?: CapabilityBooleanToggle[]
}

const DEFAULT_PANEL_MAX_HEIGHT = 280
const VIEWPORT_EDGE_GAP = 8

// ─── Helpers ──────────────────────────────────────────

function RatioIcon({ ratio, size = 12, selected = false }: { ratio: string; size?: number; selected?: boolean }) {
    return (
        <RatioPreviewIcon
            ratio={ratio}
            size={size}
            selected={selected}
            radiusClassName="rounded-[3px]"
        />
    )
}

function isRatioLike(field: string, options: CapabilityValue[]): boolean {
    const normalizedField = field.toLowerCase().replace(/[_\-\s]/g, '')
    if (normalizedField === 'ratio' || normalizedField === 'aspectratio') return true
    return options.every((o) => typeof o === 'string' && /^\d+:\d+$/.test(o))
}

function isValidRatioText(value: string): boolean {
    return /^\d+:\d+$/.test(value)
}

function shouldUseSelectControl(field: string, options: CapabilityValue[]): boolean {
    if (options.length <= 3) return false
    if (field.toLowerCase().includes('duration')) return true
    if (field.toLowerCase().includes('fps')) return true
    return options.every((item) => typeof item === 'number')
}

function formatValue(val: CapabilityValue, field: string): string {
    const s = String(val)
    if (field === 'duration') return `${s}s`
    return s
}

function isOptionDisabled(def: CapabilityFieldDefinition, option: CapabilityValue): boolean {
    if (!Array.isArray(def.disabledOptions) || def.disabledOptions.length === 0) return false
    return def.disabledOptions.includes(option)
}

// ─── Component ────────────────────────────────────────

export function ModelCapabilityDropdown({
    models,
    value,
    onModelChange,
    capabilityFields,
    capabilityOverrides,
    onCapabilityChange,
    placeholder,
    compact = false,
    booleanToggles = [],
}: ModelCapabilityDropdownProps) {
    const t = useTranslations('configModal')
    const tv = useTranslations('video')
    const [isOpen, setIsOpen] = useState(false)
    const [openUpward, setOpenUpward] = useState(false)
    const [panelMaxHeight, setPanelMaxHeight] = useState<number>(DEFAULT_PANEL_MAX_HEIGHT)
    const ref = useRef<HTMLDivElement>(null)

    const updateDropdownPlacement = useCallback(() => {
        const container = ref.current
        if (!container) return

        const rect = container.getBoundingClientRect()
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight
        const spaceAbove = Math.max(0, rect.top - VIEWPORT_EDGE_GAP)
        const spaceBelow = Math.max(0, viewportHeight - rect.bottom - VIEWPORT_EDGE_GAP)
        const shouldOpenUpward = spaceBelow < DEFAULT_PANEL_MAX_HEIGHT && spaceAbove > spaceBelow
        const availableSpace = shouldOpenUpward ? spaceAbove : spaceBelow

        setOpenUpward(shouldOpenUpward)
        setPanelMaxHeight(Math.max(0, Math.min(DEFAULT_PANEL_MAX_HEIGHT, Math.floor(availableSpace))))
    }, [])

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false)
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    useLayoutEffect(() => {
        if (!isOpen) return

        updateDropdownPlacement()
        window.addEventListener('resize', updateDropdownPlacement)
        window.addEventListener('scroll', updateDropdownPlacement, true)

        return () => {
            window.removeEventListener('resize', updateDropdownPlacement)
            window.removeEventListener('scroll', updateDropdownPlacement, true)
        }
    }, [isOpen, updateDropdownPlacement])

    const handleToggleOpen = () => {
        if (isOpen) {
            setIsOpen(false)
            return
        }
        updateDropdownPlacement()
        setIsOpen(true)
    }

    const selectedModel = models.find((m) => m.value === value)
    const visibleCapabilityFields = capabilityFields.filter((field) => field.field !== 'generationMode')

    const resolveCapabilityLabel = useCallback((field: CapabilityFieldDefinition): string => {
        try {
            return tv(`capability.${field.field}` as never)
        } catch {
            return field.label
        }
    }, [tv])

    // Build summary text from capability overrides + defaults
    const paramSummary = visibleCapabilityFields
        .map((def) => {
            const val = capabilityOverrides[def.field] !== undefined
                ? String(capabilityOverrides[def.field])
                : (def.options.length > 0 ? formatValue(def.options[0], def.field) : '')
            return val
        })
        .concat(
            booleanToggles.map((toggle) => {
                if (toggle.value) return `${toggle.label}:${toggle.onLabel || 'On'}`
                return ''
            }),
        )
        .filter(Boolean)
        .join(' · ')

    const triggerPy = compact ? 'py-1' : 'py-2.5'
    const triggerPx = compact ? 'px-1.5' : 'px-3'
    const textSize = compact ? 'text-[11px]' : 'text-sm'
    const subTextSize = compact ? 'text-[9px]' : 'text-[11px]'
    const providerSize = compact ? 'text-[9px]' : 'text-[10px]'
    const modelOptionTextSize = compact ? 'text-[12px]' : 'text-sm'
    const modelOptionProviderSize = compact ? 'text-[9px] px-1 py-0.5' : 'text-[10px] px-1.5 py-0.5'

    return (
        <div className="relative" ref={ref}>
            {/* ─── Trigger ─── */}
            <button
                type="button"
                onClick={handleToggleOpen}
                className={`glass-input-base ${triggerPx} ${triggerPy} flex w-full items-center justify-between gap-2 cursor-pointer transition-colors`}
            >
                <div className="flex-1 min-w-0">
                    {selectedModel ? (
                        <>
                            <div className="flex items-center gap-2">
                                <span className={`${textSize} text-[var(--glass-text-primary)] font-medium`}>
                                    {selectedModel.label}
                                </span>
                                <span className={`${providerSize} px-1.5 py-0.5 rounded border border-[var(--glass-stroke-base)] text-[var(--glass-text-tertiary)]`}>
                                    {selectedModel.providerName || selectedModel.provider || ''}
                                </span>
                            </div>
                            {paramSummary && (
                                <div className={`${subTextSize} text-[var(--glass-text-tertiary)] mt-0.5 truncate`}>
                                    {paramSummary}
                                </div>
                            )}
                        </>
                    ) : (
                        <span className={`${textSize} text-[var(--glass-text-tertiary)]`}>
                            {placeholder || t('pleaseSelect')}
                        </span>
                    )}
                </div>
                <AppIcon name="chevronDown" className={`w-4 h-4 text-[var(--glass-text-tertiary)] transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* ─── Dropdown Panel ─── */}
            {isOpen && (
                <div
                    className={`glass-surface-modal absolute z-50 left-0 right-0 overflow-hidden flex flex-col ${openUpward ? 'bottom-full mb-1' : 'top-full mt-1'}`}
                    style={{
                        minWidth: compact ? '240px' : '320px',
                        maxHeight: `${panelMaxHeight}px`,
                    }}
                >
                    {/* Model list */}
                    <div className="p-3 pb-2 shrink-0">
                        <div className="text-[10px] font-semibold text-[var(--glass-text-tertiary)] uppercase tracking-wider mb-2">
                            {t('selectModel')}
                        </div>
                    </div>
                    <div className="px-3 pb-2 min-h-0 flex-1 overflow-y-auto custom-scrollbar">
                        <div className="space-y-1">
                            {models.map((m) => (
                                <button
                                    key={m.value}
                                    type="button"
                                    onClick={() => {
                                        if (m.disabled) return
                                        onModelChange(m.value)
                                        // Don't close — let user configure params
                                    }}
                                    disabled={m.disabled}
                                    className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left transition-all ${value === m.value
                                        ? 'bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)] shadow-[0_0_0_1px_rgba(79,128,255,0.35)]'
                                        : m.disabled
                                            ? 'text-[var(--glass-text-tertiary)] opacity-60 cursor-not-allowed'
                                            : 'hover:bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)]'
                                        }`}
                                >
                                    <span className={`font-medium ${modelOptionTextSize}`}>{m.label}</span>
                                    <span className={`${modelOptionProviderSize} rounded border border-[var(--glass-stroke-base)] text-[var(--glass-text-tertiary)]`}>
                                        {m.providerName || m.provider || ''}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Capability params: fixed at panel bottom */}
                    {(visibleCapabilityFields.length > 0 || booleanToggles.length > 0) && (
                        <div className="shrink-0 border-t border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]">
                            <div className="p-3 pt-2">
                                <div className="text-[10px] font-semibold text-[var(--glass-text-tertiary)] uppercase tracking-wider mb-2">
                                    {t('paramConfig')}
                                </div>
                                <div className="max-h-[156px] overflow-y-auto custom-scrollbar pr-1">
                                    <div className="space-y-2.5">
                                        {visibleCapabilityFields.map((def) => {
                                            const currentVal = capabilityOverrides[def.field] !== undefined
                                                ? String(capabilityOverrides[def.field])
                                                : ''
                                            const isR = isRatioLike(def.field, def.options)
                                            const useSelect = shouldUseSelectControl(def.field, def.options)
                                            const fallbackOption = def.options[0]
                                            const selectValue = currentVal || String(fallbackOption)

                                            return (
                                                <div key={def.field} className="flex items-center justify-between gap-3">
                                                    <span className="text-xs text-[var(--glass-text-secondary)] font-medium shrink-0">
                                                        {resolveCapabilityLabel(def)}
                                                    </span>
                                                    {def.options.length === 1 ? (
                                                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-[var(--glass-bg-surface-strong)] border border-[var(--glass-stroke-base)] text-[var(--glass-text-secondary)] flex items-center gap-1">
                                                            {(() => {
                                                                const ratioValue = String(def.options[0])
                                                                return isR && isValidRatioText(ratioValue) ? <RatioIcon ratio={ratioValue} size={10} /> : null
                                                            })()}
                                                            {String(def.options[0])}
                                                            <span className="text-[var(--glass-text-tertiary)] text-[10px]">({t('fixed')})</span>
                                                        </span>
                                                    ) : useSelect ? (
                                                        <select
                                                            value={selectValue}
                                                            onChange={(event) => onCapabilityChange(def.field, event.target.value, def.options[0])}
                                                            className="min-w-[110px] px-2 py-1 text-[11px] rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] text-[var(--glass-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--glass-tone-info-fg)]"
                                                        >
                                                            {def.options.map((opt) => {
                                                                const s = String(opt)
                                                                return (
                                                                    <option key={s} value={s}>
                                                                        {s}
                                                                    </option>
                                                                )
                                                            })}
                                                        </select>
                                                    ) : (
                                                        <div className="flex rounded-lg border border-[var(--glass-stroke-base)] overflow-hidden">
                                                            {def.options.map((opt) => {
                                                                const s = String(opt)
                                                                const disabled = isOptionDisabled(def, opt)
                                                                // If no override, highlight first option as default
                                                                const on = currentVal ? s === currentVal : s === String(fallbackOption)
                                                                return (
                                                                    <button
                                                                        key={s}
                                                                        type="button"
                                                                        onClick={() => onCapabilityChange(def.field, s, def.options[0])}
                                                                        className={`px-2 py-0.5 text-[11px] font-medium transition-all flex items-center gap-1 cursor-pointer ${on
                                                                            ? 'bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]'
                                                                            : disabled
                                                                                ? 'text-[var(--glass-text-tertiary)] bg-[var(--glass-bg-muted)] opacity-75 hover:opacity-95'
                                                                                : 'text-[var(--glass-text-secondary)] bg-[var(--glass-bg-surface)] hover:bg-[var(--glass-bg-muted)]'
                                                                            }`}
                                                                    >
                                                                        {isR && isValidRatioText(s) && <RatioIcon ratio={s} size={10} selected={on} />}
                                                                        {s}
                                                                    </button>
                                                                )
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                        {booleanToggles.map((toggle) => (
                                            <div key={toggle.key} className="flex items-center justify-between gap-3">
                                                <span className="text-xs text-[var(--glass-text-secondary)] font-medium shrink-0">
                                                    {toggle.label}
                                                </span>
                                                <div className="flex rounded-lg border border-[var(--glass-stroke-base)] overflow-hidden">
                                                    <button
                                                        type="button"
                                                        onClick={() => toggle.onChange(true)}
                                                        className={`px-2 py-0.5 text-[11px] font-medium transition-all ${toggle.value
                                                            ? 'bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]'
                                                            : 'text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)]'
                                                            }`}
                                                    >
                                                        {toggle.onLabel || 'On'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggle.onChange(false)}
                                                        className={`px-2 py-0.5 text-[11px] font-medium transition-all ${!toggle.value
                                                            ? 'bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]'
                                                            : 'text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)]'
                                                            }`}
                                                    >
                                                        {toggle.offLabel || 'Off'}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
