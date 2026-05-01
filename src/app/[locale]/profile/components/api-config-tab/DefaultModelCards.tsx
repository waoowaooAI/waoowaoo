'use client'

import React, { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AppIcon } from '@/components/ui/icons'
import type { AppIconName } from '@/components/ui/icons'
import { ModelCapabilityDropdown } from '@/components/ui/config-modals/ModelCapabilityDropdown'
import type { CapabilityValue, ModelCapabilities } from '@/lib/ai-registry/types'
import {
    getDefaultModelEmptyStateText,
    type DefaultModelEmptyStateType,
} from './default-model-empty-state'

// ---------- types ----------
type ModelType = 'llm' | 'image' | 'video' | 'audio' | 'music' | 'lipsync' | 'voicedesign'

interface ModelOption {
    modelKey: string
    name: string
    provider: string
    providerName?: string
    capabilities?: ModelCapabilities
}

type DefaultModelField =
    | 'analysisModel'
    | 'characterModel'
    | 'locationModel'
    | 'storyboardModel'
    | 'editModel'
    | 'videoModel'
    | 'audioModel'
    | 'musicModel'
    | 'lipSyncModel'
    | 'voiceDesignModel'

interface DefaultModelCardsProps {
    t: (key: string) => string
    defaultModels: {
        analysisModel?: string
        characterModel?: string
        locationModel?: string
        storyboardModel?: string
        editModel?: string
        videoModel?: string
        audioModel?: string
        musicModel?: string
        lipSyncModel?: string
        voiceDesignModel?: string
    }
    getEnabledModelsByType: (type: ModelType) => ModelOption[]
    parseModelKey: (key: string | undefined | null) => { provider: string; modelId: string } | null
    encodeModelKey: (provider: string, modelId: string) => string
    getProviderDisplayName: (providerId: string, locale: string) => string
    locale: string
    updateDefaultModel: (field: string, value: string, capFields?: Array<{ field: string; options: CapabilityValue[] }>) => void
    batchUpdateDefaultModels: (fields: string[], value: string, capFields?: Array<{ field: string; options: CapabilityValue[] }>) => void
    toCapabilityFieldLabel: (field: string) => string
    capabilityDefaults: Record<string, Record<string, CapabilityValue>>
    updateCapabilityDefault: (modelKey: string, field: string, value: CapabilityValue | null) => void
    parseBySample: (input: string, sample: CapabilityValue) => CapabilityValue
    workflowConcurrency: { analysis: number; image: number; video: number }
    handleWorkflowConcurrencyChange: (field: 'analysis' | 'image' | 'video', rawValue: string) => void
}

// ---------- helpers ----------
function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}
function isCapabilityValue(value: unknown): value is CapabilityValue {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function resolveModel(
    field: DefaultModelField,
    modelType: ModelType,
    defaultModels: DefaultModelCardsProps['defaultModels'],
    getEnabledModelsByType: DefaultModelCardsProps['getEnabledModelsByType'],
    parseModelKey: DefaultModelCardsProps['parseModelKey'],
    encodeModelKey: DefaultModelCardsProps['encodeModelKey'],
) {
    const options = getEnabledModelsByType(modelType)
    const currentKey = defaultModels[field]
    const parsed = parseModelKey(currentKey)
    const normalizedKey = parsed ? encodeModelKey(parsed.provider, parsed.modelId) : ''
    const current = normalizedKey ? options.find((option) => option.modelKey === normalizedKey) ?? null : null
    return { options, normalizedKey, current }
}

function computeCapabilityFields(current: ModelOption | null, modelType: keyof ModelCapabilities) {
    if (!current || !current.capabilities) return [] as Array<{ field: string; options: CapabilityValue[] }>
    const namespace = current.capabilities[modelType]
    if (!isRecord(namespace)) return [] as Array<{ field: string; options: CapabilityValue[] }>
    return Object.entries(namespace)
        .filter(([key, value]) => key.endsWith('Options') && Array.isArray(value) && value.every(isCapabilityValue) && value.length > 0)
        .map(([key, value]) => ({
            field: key.slice(0, -'Options'.length),
            options: value as CapabilityValue[],
        }))
}

function EmptyModelState({
    modelType,
    t,
}: {
    modelType: DefaultModelEmptyStateType
    t: (key: string) => string
}) {
    const content = getDefaultModelEmptyStateText(modelType, t)
    const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null)
    const showTooltip = useCallback((target: HTMLElement) => {
        setTooltipRect(target.getBoundingClientRect())
    }, [])
    const hideTooltip = useCallback(() => setTooltipRect(null), [])

    return (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    <AppIcon name="alert" className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--glass-text-primary)]">
                    {content.title}
                </span>
                <button
                    type="button"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--glass-text-tertiary)] transition-colors hover:bg-[var(--glass-bg-hover)] hover:text-[var(--glass-text-primary)]"
                    aria-label={content.description}
                    onMouseEnter={(event) => showTooltip(event.currentTarget)}
                    onMouseLeave={hideTooltip}
                    onFocus={(event) => showTooltip(event.currentTarget)}
                    onBlur={hideTooltip}
                >
                    <AppIcon name="info" className="h-3.5 w-3.5" />
                </button>
                {tooltipRect && typeof document !== 'undefined' ? createPortal(
                    <div
                        className="pointer-events-none fixed z-[10000] max-w-[260px] rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-2 text-[12px] leading-relaxed text-[var(--glass-text-secondary)] shadow-[0_16px_40px_rgba(15,23,42,0.18)] backdrop-blur-xl"
                        style={{
                            left: Math.min(tooltipRect.left, window.innerWidth - 280),
                            top: tooltipRect.bottom + 8,
                        }}
                    >
                        {content.description}
                    </div>,
                    document.body,
                ) : null}
            </div>
        </div>
    )
}

// ---------- sub-components ----------

/** Smart model selector: ModelCapabilityDropdown for llm/image/video, native select for others */
function SmartSelector({
    field,
    modelType,
    options,
    normalizedKey,
    current,
    placeholder,
    locale,
    t,
    props,
}: {
    field: DefaultModelField
    modelType: ModelType
    options: ModelOption[]
    normalizedKey: string
    current: ModelOption | null
    placeholder: string
    locale: string
    t: (key: string) => string
    props: DefaultModelCardsProps
}) {
    const capabilityFields = computeCapabilityFields(current, modelType as keyof ModelCapabilities)

    if (options.length === 0) {
        return (
            <EmptyModelState
                modelType={modelType}
                t={t}
            />
        )
    }

    if (modelType === 'video' || modelType === 'image' || modelType === 'llm') {
        return (
            <ModelCapabilityDropdown
                models={options.map((opt) => ({
                    value: opt.modelKey,
                    label: opt.name,
                    provider: opt.provider,
                    providerName: opt.providerName || props.getProviderDisplayName(opt.provider, locale),
                }))}
                value={normalizedKey || undefined}
                onModelChange={(newModelKey) => {
                    const newModel = options.find((option) => option.modelKey === newModelKey) ?? null
                    const newCapabilityFields = computeCapabilityFields(newModel, modelType as keyof ModelCapabilities)
                    props.updateDefaultModel(field, newModelKey, newCapabilityFields)
                }}
                capabilityFields={capabilityFields.map((d) => ({
                    ...d,
                    label: props.toCapabilityFieldLabel(d.field),
                }))}
                capabilityOverrides={
                    current
                        ? Object.fromEntries(
                            capabilityFields
                                .filter((d) => props.capabilityDefaults[current.modelKey]?.[d.field] !== undefined)
                                .map((d) => [d.field, props.capabilityDefaults[current.modelKey][d.field]])
                        )
                        : {}
                }
                onCapabilityChange={(capField, rawValue, sample) => {
                    if (!current) return
                    if (!rawValue) {
                        props.updateCapabilityDefault(current.modelKey, capField, null)
                        return
                    }
                    props.updateCapabilityDefault(current.modelKey, capField, props.parseBySample(rawValue, sample))
                }}
                placeholder={placeholder}
            />
        )
    }

    // Native select for audio / music / lipsync / voicedesign
    return (
        <div className="relative">
            <select
                value={normalizedKey}
                onChange={(event) => props.updateDefaultModel(field, event.target.value)}
                className="glass-input-base w-full cursor-pointer appearance-none px-3 py-2 text-[13px] rounded-xl outline-none transition-all text-[var(--glass-text-primary)]"
            >
                <option value="">{placeholder}</option>
                {options.map((option, index) => (
                    <option key={`${option.modelKey}-${index}`} value={option.modelKey}>
                        {option.name} ({option.providerName || props.getProviderDisplayName(option.provider, locale)})
                    </option>
                ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[var(--glass-text-tertiary)]">
                <AppIcon name="chevronDown" className="h-4 w-4" />
            </div>
        </div>
    )
}

function CompactConcurrencyControl({
    value,
    label,
    description,
    decreaseLabel,
    increaseLabel,
    onChange,
}: {
    value: number
    label: string
    description: string
    decreaseLabel: string
    increaseLabel: string
    onChange: (rawValue: string) => void
}) {
    const updateByStep = useCallback((nextValue: number) => {
        if (nextValue < 1) return
        onChange(String(nextValue))
    }, [onChange])

    return (
        <div className="flex shrink-0 items-center gap-1.5" title={description}>
            <span className="text-[10px] font-medium text-[var(--glass-text-secondary)] whitespace-nowrap">
                {label}
            </span>
            <div className="inline-flex h-7 items-center gap-0.5 rounded-lg bg-[var(--glass-bg-muted)] px-1 shadow-[inset_0_0_0_1px_var(--glass-stroke-base)] transition-shadow hover:shadow-[inset_0_0_0_1px_var(--glass-stroke-strong)]">
                <button
                    type="button"
                    aria-label={`${decreaseLabel}: ${label}`}
                    disabled={value <= 1}
                    onClick={() => updateByStep(value - 1)}
                    className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-md text-[var(--glass-text-secondary)] transition-all hover:bg-[var(--glass-bg-hover)] hover:text-[var(--glass-text-primary)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
                >
                    <AppIcon name="minus" className="h-3 w-3" />
                </button>
                <input
                    type="number"
                    min={1}
                    step={1}
                    aria-label={label}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    className="h-5 w-6 bg-transparent p-0 text-center text-[11px] font-semibold text-[var(--glass-text-primary)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <button
                    type="button"
                    aria-label={`${increaseLabel}: ${label}`}
                    onClick={() => updateByStep(value + 1)}
                    className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-md text-[var(--glass-text-secondary)] transition-all hover:bg-[var(--glass-bg-hover)] hover:text-[var(--glass-text-primary)] active:scale-95"
                >
                    <AppIcon name="plus" className="h-3 w-3" />
                </button>
            </div>
        </div>
    )
}

// ---------- main component ----------

export function DefaultModelCards(allProps: DefaultModelCardsProps) {
  const {
    t,
    defaultModels,
    getEnabledModelsByType,
    parseModelKey,
    encodeModelKey,
    getProviderDisplayName,
    locale,
    batchUpdateDefaultModels,
    workflowConcurrency,
    handleWorkflowConcurrencyChange,
  } = allProps

    // Pipeline unified override state
    const [pipelineGlobalKey, setPipelineGlobalKey] = useState('')
    const [pipelineGlobalCapOverrides, setPipelineGlobalCapOverrides] = useState<Record<string, CapabilityValue>>({})
    const pipelineGlobalOptions = getEnabledModelsByType('image')
    const pipelineGlobalCurrent = pipelineGlobalOptions.find((opt) => opt.modelKey === pipelineGlobalKey) ?? null
    const pipelineGlobalCapFields = computeCapabilityFields(pipelineGlobalCurrent, 'image')
  const handlePipelineGlobalChange = useCallback((newModelKey: string) => {
    setPipelineGlobalKey(newModelKey)
    setPipelineGlobalCapOverrides({})
    if (newModelKey) {
      const pipelineFields = ['characterModel', 'locationModel', 'storyboardModel', 'editModel']
      const newModel = pipelineGlobalOptions.find((option) => option.modelKey === newModelKey) ?? null
      const newCapabilityFields = computeCapabilityFields(newModel, 'image')
      batchUpdateDefaultModels(pipelineFields, newModelKey, newCapabilityFields)
    }
  }, [batchUpdateDefaultModels, pipelineGlobalOptions])

    const handlePipelineGlobalCapChange = useCallback((field: string, rawValue: string, sample: CapabilityValue) => {
        if (!pipelineGlobalCurrent) return
        const parsed = allProps.parseBySample(rawValue, sample)
        setPipelineGlobalCapOverrides((prev) => ({ ...prev, [field]: parsed }))
        // Batch update all 4 pipeline fields
        const pipelineFields = ['characterModel', 'locationModel', 'storyboardModel', 'editModel']
        for (const pField of pipelineFields) {
            allProps.updateCapabilityDefault(pipelineGlobalCurrent.modelKey, field, parsed)
            // Also update each individual pipeline model's capability if they share the same model
            const resolvedField = defaultModels[pField as DefaultModelField]
            if (resolvedField === pipelineGlobalCurrent.modelKey) {
                allProps.updateCapabilityDefault(resolvedField, field, parsed)
            }
        }
    }, [pipelineGlobalCurrent, allProps, defaultModels])

    // Resolve all models
    const textModel = resolveModel('analysisModel', 'llm', defaultModels, getEnabledModelsByType, parseModelKey, encodeModelKey)
    const videoModel = resolveModel('videoModel', 'video', defaultModels, getEnabledModelsByType, parseModelKey, encodeModelKey)
    const audioModel = resolveModel('audioModel', 'audio', defaultModels, getEnabledModelsByType, parseModelKey, encodeModelKey)
    const musicModel = resolveModel('musicModel', 'music', defaultModels, getEnabledModelsByType, parseModelKey, encodeModelKey)
    const lipsyncModel = resolveModel('lipSyncModel', 'lipsync', defaultModels, getEnabledModelsByType, parseModelKey, encodeModelKey)
    const voiceDesignModel = resolveModel('voiceDesignModel', 'voicedesign', defaultModels, getEnabledModelsByType, parseModelKey, encodeModelKey)

    const pipelineItems: Array<{
        field: DefaultModelField
        modelType: ModelType
        titleKey: string
        icon: AppIconName
    }> = [
            { field: 'characterModel', modelType: 'image', titleKey: 'defaultModelSection.pipelineCharacter', icon: 'user' },
            { field: 'locationModel', modelType: 'image', titleKey: 'defaultModelSection.pipelineLocation', icon: 'image' },
            { field: 'storyboardModel', modelType: 'image', titleKey: 'defaultModelSection.pipelineStoryboard', icon: 'film' },
            { field: 'editModel', modelType: 'image', titleKey: 'defaultModelSection.pipelineEdit', icon: 'edit' },
        ]

    return (
        <div className="p-8 rounded-3xl bg-[var(--glass-bg-base)] shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] relative overflow-hidden">
            {/* Background glow effects */}
            <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-500/10 rounded-full blur-[100px] pointer-events-none" />

            <div className="relative z-10">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-2.5 mb-1">
                        <span className="glass-surface-soft inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--glass-text-secondary)]">
                            <AppIcon name="settingsHex" className="w-4 h-4" />
                        </span>
                        <h2 className="text-xl font-bold text-[var(--glass-text-primary)]">{t('defaultModels')}</h2>
                    </div>
                    <p className="text-[13px] text-[var(--glass-text-secondary)] ml-[38px]">{t('defaultModel.hint')}</p>
                </div>

                {/* ===== Section 1: Core Foundation ===== */}
                <h3 className="text-[17px] font-bold text-[var(--glass-text-primary)] mb-5 flex items-center gap-2">
                    <AppIcon name="bolt" className="w-5 h-5 text-blue-500" />
                    {t('defaultModelSection.coreFoundation')}
                </h3>
                <div className="flex flex-col md:flex-row gap-4 mb-8">
                    {/* Text Model Card */}
                    <div className="flex-1 glass-surface glass-card-shadow-soft p-4 rounded-2xl border border-[var(--glass-stroke-base)] hover:border-blue-500/30 transition-colors bg-gradient-to-br from-[var(--glass-bg-surface)] to-transparent">
                        <div className="flex items-start justify-between mb-2">
                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                                <AppIcon name="fileText" className="w-4 h-4 text-blue-500" />
                            </div>
                            <CompactConcurrencyControl
                                value={workflowConcurrency.analysis}
                                label={t('workflowConcurrency.analysis')}
                                description={t('workflowConcurrency.analysis')}
                                decreaseLabel={t('workflowConcurrency.decrease')}
                                increaseLabel={t('workflowConcurrency.increase')}
                                onChange={(rawValue) => handleWorkflowConcurrencyChange('analysis', rawValue)}
                            />
                        </div>
                        <h4 className="text-[14px] font-bold text-[var(--glass-text-primary)] mb-0.5">{t('defaultModelSection.coreTextTitle')}</h4>
                        <p className="text-[11px] text-[var(--glass-text-tertiary)] mb-3">{t('defaultModelDesc.analysisModel')}</p>
                        <SmartSelector
                            field="analysisModel" modelType="llm"
                            options={textModel.options} normalizedKey={textModel.normalizedKey} current={textModel.current}
                            placeholder={t('defaultModelSection.corePlaceholder')}
                            locale={locale} t={t} props={allProps}
                        />
                    </div>

                    {/* Video Model Card */}
                    <div className="flex-1 glass-surface glass-card-shadow-soft p-4 rounded-2xl border border-[var(--glass-stroke-base)] hover:border-purple-500/30 transition-colors bg-gradient-to-br from-[var(--glass-bg-surface)] to-transparent">
                        <div className="flex items-start justify-between mb-2">
                            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                                <AppIcon name="clapperboard" className="w-4 h-4 text-purple-500" />
                            </div>
                            <CompactConcurrencyControl
                                value={workflowConcurrency.video}
                                label={t('workflowConcurrency.video')}
                                description={t('workflowConcurrency.video')}
                                decreaseLabel={t('workflowConcurrency.decrease')}
                                increaseLabel={t('workflowConcurrency.increase')}
                                onChange={(rawValue) => handleWorkflowConcurrencyChange('video', rawValue)}
                            />
                        </div>
                        <h4 className="text-[14px] font-bold text-[var(--glass-text-primary)] mb-0.5">{t('defaultModelSection.coreVideoTitle')}</h4>
                        <p className="text-[11px] text-[var(--glass-text-tertiary)] mb-3">{t('defaultModelDesc.videoModel')}</p>
                        <SmartSelector
                            field="videoModel" modelType="video"
                            options={videoModel.options} normalizedKey={videoModel.normalizedKey} current={videoModel.current}
                            placeholder={t('defaultModelSection.corePlaceholder')}
                            locale={locale} t={t} props={allProps}
                        />
                    </div>
                </div>


                {/* ===== Section 2: Global Image Model Config ===== */}
                <div className="mb-5 flex items-center justify-between gap-3">
                    <h3 className="text-[17px] font-bold text-[var(--glass-text-primary)] flex items-center gap-2">
                        <AppIcon name="sparklesAlt" className="w-5 h-5 text-indigo-500" />
                        {t('defaultModelSection.creativePipeline')}
                    </h3>
                </div>
                <div className="glass-surface glass-card-shadow-soft p-6 rounded-3xl border border-indigo-500/20 bg-indigo-500/[0.02] mb-8">
                    {pipelineGlobalOptions.length === 0 ? (
                        <EmptyModelState
                            modelType="image"
                            t={t}
                        />
                    ) : (
                        <>
                            {/* Batch config header */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-indigo-500/10">
                                <div>
                                    <div className="text-[14px] font-semibold text-[var(--glass-text-primary)]">{t('defaultModelSection.unifiedOverride')}</div>
                                    <div className="text-[12px] text-[var(--glass-text-tertiary)] mt-0.5">{t('defaultModelSection.unifiedOverrideHint')}</div>
                                </div>
                                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                                    <CompactConcurrencyControl
                                        value={workflowConcurrency.image}
                                        label={t('workflowConcurrency.image')}
                                        description={t('workflowConcurrency.imageDescription')}
                                        decreaseLabel={t('workflowConcurrency.decrease')}
                                        increaseLabel={t('workflowConcurrency.increase')}
                                        onChange={(rawValue) => handleWorkflowConcurrencyChange('image', rawValue)}
                                    />
                                    <div className="min-w-0 flex-1 sm:w-[280px] sm:flex-none">
                                        <ModelCapabilityDropdown
                                            models={pipelineGlobalOptions.map((opt) => ({
                                                value: opt.modelKey,
                                                label: opt.name,
                                                provider: opt.provider,
                                                providerName: opt.providerName || getProviderDisplayName(opt.provider, locale),
                                            }))}
                                            value={pipelineGlobalKey || undefined}
                                            onModelChange={handlePipelineGlobalChange}
                                            capabilityFields={pipelineGlobalCapFields.map((d) => ({
                                                ...d,
                                                label: allProps.toCapabilityFieldLabel(d.field),
                                            }))}
                                            capabilityOverrides={pipelineGlobalCapOverrides}
                                            onCapabilityChange={handlePipelineGlobalCapChange}
                                            placeholder={t('defaultModelSection.unifiedOverridePlaceholder')}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* 4 pipeline nodes */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                {pipelineItems.map((item) => {
                                    const resolved = resolveModel(item.field, item.modelType, defaultModels, getEnabledModelsByType, parseModelKey, encodeModelKey)
                                    return (
                                        <div key={item.field} className="glass-surface glass-card-shadow-soft p-4 rounded-2xl bg-gradient-to-br from-[var(--glass-bg-surface)] to-transparent flex flex-col gap-3">
                                            <div className="flex items-center gap-2 mb-1">
                                                <AppIcon name={item.icon} className="w-4 h-4 text-[var(--glass-text-tertiary)]" />
                                                <span className="text-[13px] font-semibold text-[var(--glass-text-secondary)]">{t(item.titleKey)}</span>
                                            </div>
                                            <SmartSelector
                                                field={item.field} modelType={item.modelType}
                                                options={resolved.options} normalizedKey={resolved.normalizedKey} current={resolved.current}
                                                placeholder={t('defaultModelSection.followUnified')}
                                                locale={locale} t={t} props={allProps}
                                            />
                                        </div>
                                    )
                                })}
                            </div>
                        </>
                    )}
                </div>

                {/* ===== Section 3: Extensions ===== */}
                <h3 className="text-[17px] font-bold text-[var(--glass-text-primary)] mb-5 flex items-center gap-2">
                    <AppIcon name="cube" className="w-5 h-5 text-emerald-500" />
                    {t('defaultModelSection.extensions')}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                    {/* Lip Sync */}
                    <div className="glass-surface glass-card-shadow-soft p-5 rounded-2xl bg-gradient-to-br from-[var(--glass-bg-surface)] to-transparent">
                        <h4 className="text-[13px] font-semibold text-[var(--glass-text-primary)] mb-4">{t('defaultModelSection.extLipSync')}</h4>
                        <SmartSelector
                            field="lipSyncModel" modelType="lipsync"
                            options={lipsyncModel.options} normalizedKey={lipsyncModel.normalizedKey} current={lipsyncModel.current}
                            placeholder={t('defaultModelSection.extPlaceholder')}
                            locale={locale} t={t} props={allProps}
                        />
                    </div>
                    {/* TTS */}
                    <div className="glass-surface glass-card-shadow-soft p-5 rounded-2xl bg-gradient-to-br from-[var(--glass-bg-surface)] to-transparent">
                        <h4 className="text-[13px] font-semibold text-[var(--glass-text-primary)] mb-4">{t('defaultModelSection.extTTS')}</h4>
                        <SmartSelector
                            field="audioModel" modelType="audio"
                            options={audioModel.options} normalizedKey={audioModel.normalizedKey} current={audioModel.current}
                            placeholder={t('defaultModelSection.extPlaceholder')}
                            locale={locale} t={t} props={allProps}
                        />
                    </div>
                    {/* Music */}
                    <div className="glass-surface glass-card-shadow-soft p-5 rounded-2xl bg-gradient-to-br from-[var(--glass-bg-surface)] to-transparent">
                        <h4 className="text-[13px] font-semibold text-[var(--glass-text-primary)] mb-4">{t('defaultModelSection.extMusic')}</h4>
                        <SmartSelector
                            field="musicModel" modelType="music"
                            options={musicModel.options} normalizedKey={musicModel.normalizedKey} current={musicModel.current}
                            placeholder={t('defaultModelSection.extPlaceholder')}
                            locale={locale} t={t} props={allProps}
                        />
                    </div>
                    {/* Voice Design */}
                    <div className="glass-surface glass-card-shadow-soft p-5 rounded-2xl bg-gradient-to-br from-[var(--glass-bg-surface)] to-transparent">
                        <h4 className="text-[13px] font-semibold text-[var(--glass-text-primary)] mb-4">{t('defaultModelSection.extVoiceDesign')}</h4>
                        <SmartSelector
                            field="voiceDesignModel" modelType="voicedesign"
                            options={voiceDesignModel.options} normalizedKey={voiceDesignModel.normalizedKey} current={voiceDesignModel.current}
                            placeholder={t('defaultModelSection.extPlaceholder')}
                            locale={locale} t={t} props={allProps}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
