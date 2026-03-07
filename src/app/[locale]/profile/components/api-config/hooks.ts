'use client'
import { logError as _ulogError } from '@/lib/logging/core'
import { useLocale, useTranslations } from 'next-intl'
import { apiFetch } from '@/lib/api-fetch'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
    Provider,
    CustomModel,
    PRESET_PROVIDERS,
    PRESET_MODELS,
    encodeModelKey,
    getProviderKey,
    isPresetComingSoonModelKey,
    resolvePresetProviderName,
    type PricingDisplayItem,
    type PricingDisplayMap,
} from './types'
import type { CapabilitySelections, CapabilityValue } from '@/lib/model-config-contract'
import {
    DEFAULT_ANALYSIS_WORKFLOW_CONCURRENCY,
    DEFAULT_IMAGE_WORKFLOW_CONCURRENCY,
    DEFAULT_VIDEO_WORKFLOW_CONCURRENCY,
    normalizeWorkflowConcurrencyValue,
} from '@/lib/workflow-concurrency'

interface DefaultModels {
    analysisModel?: string
    characterModel?: string
    locationModel?: string
    storyboardModel?: string
    editModel?: string
    videoModel?: string
    audioModel?: string
    lipSyncModel?: string
    voiceDesignModel?: string
}

interface WorkflowConcurrency {
    analysis: number
    image: number
    video: number
}

interface UseProvidersReturn {
    providers: Provider[]
    models: CustomModel[]
    defaultModels: DefaultModels
    workflowConcurrency: WorkflowConcurrency
    capabilityDefaults: CapabilitySelections
    loading: boolean
    saveStatus: 'idle' | 'saving' | 'saved' | 'error'
    flushConfig: () => Promise<void>
    updateProviderHidden: (providerId: string, hidden: boolean) => void
    updateProviderApiKey: (providerId: string, apiKey: string) => void
    updateProviderBaseUrl: (providerId: string, baseUrl: string) => void
    reorderProviders: (activeProviderId: string, overProviderId: string) => void
    addProvider: (provider: Omit<Provider, 'hasApiKey'>) => void
    deleteProvider: (providerId: string) => void
    updateProviderInfo: (providerId: string, name: string, baseUrl?: string) => void
    toggleModel: (modelKey: string, providerId?: string) => void
    updateModel: (modelKey: string, updates: Partial<CustomModel>, providerId?: string) => void
    addModel: (model: Omit<CustomModel, 'enabled'>) => void
    deleteModel: (modelKey: string, providerId?: string) => void
    updateDefaultModel: (field: string, modelKey: string, capabilityFieldsToDefault?: Array<{ field: string; options: CapabilityValue[] }>) => void
    batchUpdateDefaultModels: (fields: string[], modelKey: string, capabilityFieldsToDefault?: Array<{ field: string; options: CapabilityValue[] }>) => void
    updateWorkflowConcurrency: (field: keyof WorkflowConcurrency, value: number) => void
    updateCapabilityDefault: (modelKey: string, field: string, value: string | number | boolean | null) => void
    getModelsByType: (type: CustomModel['type']) => CustomModel[]
}

export function mergeProvidersForDisplay(
    savedProviders: Provider[],
    presetProviders: Provider[],
): Provider[] {
    const merged: Provider[] = []
    const seenProviderIds = new Set<string>()
    const seenPresetKeys = new Set<string>()

    for (const savedProvider of savedProviders) {
        if (seenProviderIds.has(savedProvider.id)) continue
        seenProviderIds.add(savedProvider.id)

        const providerKey = getProviderKey(savedProvider.id)
        const matchedPreset = presetProviders.find((presetProvider) => presetProvider.id === providerKey)
        if (matchedPreset) {
            const apiKey = savedProvider.apiKey || ''
            const providerBaseUrl = providerKey === 'minimax'
                ? matchedPreset.baseUrl
                : (savedProvider.baseUrl || matchedPreset.baseUrl)
            merged.push({
                ...matchedPreset,
                apiKey,
                hasApiKey: apiKey.length > 0,
                hidden: savedProvider.hidden === true,
                baseUrl: providerBaseUrl,
                apiMode: savedProvider.apiMode,
                gatewayRoute: savedProvider.gatewayRoute,
            })
            seenPresetKeys.add(providerKey)
            continue
        }

        merged.push({
            ...savedProvider,
            hasApiKey: !!savedProvider.apiKey,
        })
    }

    for (const presetProvider of presetProviders) {
        if (seenPresetKeys.has(presetProvider.id)) continue
        merged.push({
            ...presetProvider,
            apiKey: '',
            hasApiKey: false,
            hidden: false,
        })
    }

    return merged
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function composePricingDisplayKey(type: CustomModel['type'], provider: string, modelId: string): string {
    return `${type}::${provider}::${modelId}`
}

function parsePricingDisplayMap(raw: unknown): PricingDisplayMap {
    if (!isRecord(raw)) return {}

    const map: PricingDisplayMap = {}
    for (const [key, value] of Object.entries(raw)) {
        if (!isRecord(value)) continue
        const min = typeof value.min === 'number' && Number.isFinite(value.min) ? value.min : null
        const max = typeof value.max === 'number' && Number.isFinite(value.max) ? value.max : null
        const label = typeof value.label === 'string' ? value.label.trim() : ''
        const input = typeof value.input === 'number' && Number.isFinite(value.input) ? value.input : undefined
        const output = typeof value.output === 'number' && Number.isFinite(value.output) ? value.output : undefined
        if (min === null || max === null || !label) continue
        map[key] = {
            min,
            max,
            label,
            ...(typeof input === 'number' ? { input } : {}),
            ...(typeof output === 'number' ? { output } : {}),
        }
    }
    return map
}

const DEFAULT_WORKFLOW_CONCURRENCY: WorkflowConcurrency = {
    analysis: DEFAULT_ANALYSIS_WORKFLOW_CONCURRENCY,
    image: DEFAULT_IMAGE_WORKFLOW_CONCURRENCY,
    video: DEFAULT_VIDEO_WORKFLOW_CONCURRENCY,
}

function parseWorkflowConcurrency(raw: unknown): WorkflowConcurrency {
    if (!isRecord(raw)) return DEFAULT_WORKFLOW_CONCURRENCY
    return {
        analysis: normalizeWorkflowConcurrencyValue(
            raw.analysis,
            DEFAULT_WORKFLOW_CONCURRENCY.analysis,
        ),
        image: normalizeWorkflowConcurrencyValue(
            raw.image,
            DEFAULT_WORKFLOW_CONCURRENCY.image,
        ),
        video: normalizeWorkflowConcurrencyValue(
            raw.video,
            DEFAULT_WORKFLOW_CONCURRENCY.video,
        ),
    }
}

/**
 * Provider keys that share pricing display with a canonical provider.
 */
const PRICING_DISPLAY_ALIASES: Readonly<Record<string, string>> = {
    'gemini-compatible': 'google',
}

function resolvePricingDisplay(
    map: PricingDisplayMap,
    type: CustomModel['type'],
    provider: string,
    modelId: string,
): PricingDisplayItem | null {
    const exact = map[composePricingDisplayKey(type, provider, modelId)]
    if (exact) return exact

    const providerKey = getProviderKey(provider)
    if (providerKey !== provider) {
        const fallback = map[composePricingDisplayKey(type, providerKey, modelId)]
        if (fallback) return fallback
    }

    // Fallback: check canonical provider alias (e.g. gemini-compatible → google)
    const aliasTarget = PRICING_DISPLAY_ALIASES[providerKey]
    if (aliasTarget) {
        const aliasFallback = map[composePricingDisplayKey(type, aliasTarget, modelId)]
        if (aliasFallback) return aliasFallback
    }
    return null
}

function applyPricingDisplay(model: CustomModel, map: PricingDisplayMap): CustomModel {
    const pricing = resolvePricingDisplay(map, model.type, model.provider, model.modelId)
    if (!pricing) {
        // Preserve existing server-provided pricing fields (e.g. from customPricing)
        if (model.priceLabel && model.priceLabel !== '--') {
            return model
        }
        return {
            ...model,
            price: 0,
            priceLabel: '--',
            priceMin: undefined,
            priceMax: undefined,
            priceInput: undefined,
            priceOutput: undefined,
        }
    }

    return {
        ...model,
        price: pricing.min,
        priceMin: pricing.min,
        priceMax: pricing.max,
        priceLabel: pricing.label,
        ...(typeof pricing.input === 'number' ? { priceInput: pricing.input } : {}),
        ...(typeof pricing.output === 'number' ? { priceOutput: pricing.output } : {}),
    }
}

export function useProviders(): UseProvidersReturn {
    const locale = useLocale()
    const t = useTranslations('apiConfig')
    const presetProviders = PRESET_PROVIDERS.map((provider) => ({
        ...provider,
        name: resolvePresetProviderName(provider.id, provider.name, locale),
    }))
    const [providers, setProviders] = useState<Provider[]>(
        presetProviders.map((provider) => ({ ...provider, apiKey: '', hasApiKey: false })),
    )
    const [models, setModels] = useState<CustomModel[]>(
        PRESET_MODELS.map((model) => {
            const modelKey = encodeModelKey(model.provider, model.modelId)
            return {
                ...model,
                modelKey,
                price: 0,
                priceLabel: '--',
                enabled: !isPresetComingSoonModelKey(modelKey),
            }
        }),
    )
    const [defaultModels, setDefaultModels] = useState<DefaultModels>({})
    const [workflowConcurrency, setWorkflowConcurrency] = useState<WorkflowConcurrency>(DEFAULT_WORKFLOW_CONCURRENCY)
    const [capabilityDefaults, setCapabilityDefaults] = useState<CapabilitySelections>({})
    const [loading, setLoading] = useState(true)
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const initializedRef = useRef(false)

    // 始终持有最新值的 refs，用于避免异步保存时读到旧的闭包值
    const latestModelsRef = useRef(models)
    const latestProvidersRef = useRef(providers)
    const latestDefaultModelsRef = useRef(defaultModels)
    const latestWorkflowConcurrencyRef = useRef(workflowConcurrency)
    const latestCapabilityDefaultsRef = useRef(capabilityDefaults)
    useEffect(() => { latestModelsRef.current = models }, [models])
    useEffect(() => { latestProvidersRef.current = providers }, [providers])
    useEffect(() => { latestDefaultModelsRef.current = defaultModels }, [defaultModels])
    useEffect(() => { latestWorkflowConcurrencyRef.current = workflowConcurrency }, [workflowConcurrency])
    useEffect(() => { latestCapabilityDefaultsRef.current = capabilityDefaults }, [capabilityDefaults])

    // 加载配置
    useEffect(() => {
        fetchConfig()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    async function fetchConfig() {
        initializedRef.current = false
        let loadedSuccessfully = false
        try {
            const res = await apiFetch('/api/user/api-config')
            if (!res.ok) {
                throw new Error(`api-config load failed: HTTP ${res.status}`)
            }

            const data = await res.json()
            const pricingDisplay = parsePricingDisplayMap((data as { pricingDisplay?: unknown }).pricingDisplay)

            // 合并预设和已保存的提供商，保持 savedProviders 的顺序不变（拖拽排序依赖）
            const savedProviders: Provider[] = data.providers || []
            setProviders(mergeProvidersForDisplay(savedProviders, presetProviders))

            // 合并预设和已保存的模型
            const savedModelsRaw = data.models || []
            const savedModelsNormalized = savedModelsRaw.map((m: CustomModel) => ({
                ...m,
                modelKey: m.modelKey || encodeModelKey(m.provider, m.modelId),
            }))
            const savedModels: CustomModel[] = []
            const seen = new Set<string>()
            for (const model of savedModelsNormalized) {
                const key = model.modelKey
                if (seen.has(key)) continue
                seen.add(key)
                savedModels.push(model)
            }
            const hasSavedModels = savedModels.length > 0
            const allModels = PRESET_MODELS.map(preset => {
                const presetModelKey = encodeModelKey(preset.provider, preset.modelId)
                const saved = savedModels.find((m: CustomModel) =>
                    m.modelKey === presetModelKey
                )
                const alwaysEnabledPreset = preset.type === 'lipsync'
                const mergedPreset: CustomModel = {
                    ...preset,
                    modelKey: presetModelKey,
                    enabled: isPresetComingSoonModelKey(presetModelKey)
                        ? false
                        : (hasSavedModels ? (alwaysEnabledPreset || !!saved) : false),
                    price: 0,
                    capabilities: saved?.capabilities ?? preset.capabilities,
                }
                return applyPricingDisplay(mergedPreset, pricingDisplay)
            })
            const customModels = savedModels.filter((m: CustomModel) =>
                !PRESET_MODELS.find((preset) => encodeModelKey(preset.provider, preset.modelId) === m.modelKey)
            ).map((m: CustomModel) => ({
                ...applyPricingDisplay(m, pricingDisplay),
                // 尊重服务端返回的 enabled 字段（后端对 disabled presets 会明确返回 enabled: false）
                enabled: (m as CustomModel & { enabled?: boolean }).enabled !== false,
            }))

            setModels([...allModels, ...customModels])

            // 加载默认模型配置
            if (data.defaultModels) {
                setDefaultModels(data.defaultModels)
            }
            setWorkflowConcurrency(parseWorkflowConcurrency((data as { workflowConcurrency?: unknown }).workflowConcurrency))
            if (data.capabilityDefaults && typeof data.capabilityDefaults === 'object') {
                setCapabilityDefaults(data.capabilityDefaults as CapabilitySelections)
            }
            loadedSuccessfully = true
        } catch (error) {
            _ulogError('获取配置失败:', error)
            setSaveStatus('error')
        } finally {
            setLoading(false)
            if (loadedSuccessfully) {
                // 延迟设置 initialized，确保所有状态更新完成后才开始监听
                setTimeout(() => {
                    initializedRef.current = true
                }, 100)
            }
        }
    }

    /**
     * 核心保存函数：始终从 ref 读取最新值，支持传入覆盖值（解决异步闭包旧值问题）。
     * 状态展示遵循真实保存进度：请求发起后显示「保存中」，成功后显示「已保存」。
     */
    const performSave = useCallback(async (
        overrides?: {
        defaultModels?: DefaultModels
        workflowConcurrency?: WorkflowConcurrency
        capabilityDefaults?: CapabilitySelections
    },
        optimistic = false,
        silent = false,
    ): Promise<boolean> => {
        void optimistic
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
            saveTimeoutRef.current = null
        }
        if (!silent) {
            setSaveStatus('saving')
        }
        try {
            const currentModels = latestModelsRef.current
            const currentProviders = latestProvidersRef.current
            const currentDefaultModels = overrides?.defaultModels ?? latestDefaultModelsRef.current
            const currentWorkflowConcurrency = overrides?.workflowConcurrency ?? latestWorkflowConcurrencyRef.current
            const currentCapabilityDefaults = overrides?.capabilityDefaults ?? latestCapabilityDefaultsRef.current
            const enabledModels = currentModels.filter(m => m.enabled)
            const res = await apiFetch('/api/user/api-config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    models: enabledModels,
                    providers: currentProviders,
                    defaultModels: currentDefaultModels,
                    workflowConcurrency: currentWorkflowConcurrency,
                    capabilityDefaults: currentCapabilityDefaults,
                }),
            })
            if (res.ok) {
                if (!silent) {
                    setSaveStatus('saved')
                    setTimeout(() => setSaveStatus('idle'), 3000)
                }
                return true
            } else {
                if (!silent) setSaveStatus('error')
                return false
            }
        } catch (error) {
            _ulogError('保存失败:', error)
            if (!silent) setSaveStatus('error')
            return false
        }
    }, []) // 无依赖，所有值均从 ref 读取

    const flushConfig = useCallback(async () => {
        const success = await performSave(undefined, false, true)
        if (!success) {
            throw new Error('API_CONFIG_FLUSH_FAILED')
        }
    }, [performSave])

    // 默认模型操作：选中即立刻显示已保存（与项目设置一致）
    // capabilityFieldsToDefault：切换模型时自动将第一个 option 写入 capabilityDefaults（只填未配置字段）
    const updateDefaultModel = useCallback((
        field: string,
        modelKey: string,
        capabilityFieldsToDefault?: Array<{ field: string; options: CapabilityValue[] }>,
    ) => {
        setDefaultModels(prev => {
            const next = { ...prev, [field]: modelKey }
            latestDefaultModelsRef.current = next

            if (capabilityFieldsToDefault && capabilityFieldsToDefault.length > 0) {
                setCapabilityDefaults(prevCap => {
                    const nextCap: CapabilitySelections = { ...prevCap }
                    const existing = { ...(nextCap[modelKey] || {}) }
                    let changed = false
                    for (const def of capabilityFieldsToDefault) {
                        if (existing[def.field] === undefined && def.options.length > 0) {
                            existing[def.field] = def.options[0]
                            changed = true
                        }
                    }
                    if (changed) {
                        nextCap[modelKey] = existing
                        latestCapabilityDefaultsRef.current = nextCap
                        void performSave({ defaultModels: next, capabilityDefaults: nextCap }, true)
                        return nextCap
                    }
                    void performSave({ defaultModels: next }, true) // optimistic=true
                    return prevCap
                })
            } else {
                void performSave({ defaultModels: next }, true) // optimistic=true
            }
            return next
        })
    }, [performSave])

    /** Batch-update multiple default model fields to the same model key, saving only once */
    const batchUpdateDefaultModels = useCallback((
        fields: string[],
        modelKey: string,
        capabilityFieldsToDefault?: Array<{ field: string; options: CapabilityValue[] }>,
    ) => {
        setDefaultModels(prev => {
            const next = { ...prev }
            for (const field of fields) {
                (next as Record<string, string | undefined>)[field] = modelKey
            }
            latestDefaultModelsRef.current = next

            if (capabilityFieldsToDefault && capabilityFieldsToDefault.length > 0) {
                setCapabilityDefaults(prevCap => {
                    const nextCap: CapabilitySelections = { ...prevCap }
                    const existing = { ...(nextCap[modelKey] || {}) }
                    let changed = false
                    for (const def of capabilityFieldsToDefault) {
                        if (existing[def.field] === undefined && def.options.length > 0) {
                            existing[def.field] = def.options[0]
                            changed = true
                        }
                    }
                    if (changed) {
                        nextCap[modelKey] = existing
                        latestCapabilityDefaultsRef.current = nextCap
                        void performSave({ defaultModels: next, capabilityDefaults: nextCap }, true)
                        return nextCap
                    }
                    void performSave({ defaultModels: next }, true)
                    return prevCap
                })
            } else {
                void performSave({ defaultModels: next }, true)
            }
            return next
        })
    }, [performSave])

    const updateCapabilityDefault = useCallback((modelKey: string, field: string, value: string | number | boolean | null) => {
        setCapabilityDefaults((previous) => {
            const next: CapabilitySelections = { ...previous }
            const current = { ...(next[modelKey] || {}) }
            if (value === null) {
                delete current[field]
            } else {
                current[field] = value
            }

            if (Object.keys(current).length === 0) {
                delete next[modelKey]
            } else {
                next[modelKey] = current
            }
            latestCapabilityDefaultsRef.current = next
            void performSave({ capabilityDefaults: next }, true) // optimistic=true
            return next
        })
    }, [performSave])

    const updateWorkflowConcurrency = useCallback((field: keyof WorkflowConcurrency, value: number) => {
        const nextValue = normalizeWorkflowConcurrencyValue(value, DEFAULT_WORKFLOW_CONCURRENCY[field])
        setWorkflowConcurrency((previous) => {
            const next = { ...previous, [field]: nextValue }
            latestWorkflowConcurrencyRef.current = next
            void performSave({ workflowConcurrency: next }, true)
            return next
        })
    }, [performSave])

    // 提供商操作
    const updateProviderApiKey = useCallback((providerId: string, apiKey: string) => {
        setProviders(prev => {
            const next = prev.map(p =>
                p.id === providerId ? { ...p, apiKey, hasApiKey: !!apiKey } : p
            )
            latestProvidersRef.current = next
            void performSave(undefined, true)
            return next
        })
    }, [performSave])

    const updateProviderHidden = useCallback((providerId: string, hidden: boolean) => {
        setProviders((previous) => {
            const next = previous.map((provider) =>
                provider.id === providerId ? { ...provider, hidden } : provider,
            )
            latestProvidersRef.current = next
            void performSave(undefined, true)
            return next
        })
    }, [performSave])

    const reorderProviders = useCallback((activeProviderId: string, overProviderId: string) => {
        if (activeProviderId === overProviderId) return
        setProviders((previous) => {
            const oldIndex = previous.findIndex((provider) => provider.id === activeProviderId)
            const newIndex = previous.findIndex((provider) => provider.id === overProviderId)
            if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
                return previous
            }

            const next = [...previous]
            const moved = next[oldIndex]
            if (!moved) return previous
            next.splice(oldIndex, 1)
            next.splice(newIndex, 0, moved)
            latestProvidersRef.current = next
            void performSave(undefined, true)
            return next
        })
    }, [performSave])

    const addProvider = useCallback((provider: Omit<Provider, 'hasApiKey'>) => {
        setProviders(prev => {
            const normalizedProviderId = provider.id.toLowerCase()
            if (prev.some((p) => p.id.toLowerCase() === normalizedProviderId)) {
                alert(t('providerIdExists'))
                return prev
            }
            const newProvider: Provider = { ...provider, hasApiKey: !!provider.apiKey }
            const next = [...prev, newProvider]
            latestProvidersRef.current = next

            const providerKey = getProviderKey(provider.id)
            if (providerKey === 'gemini-compatible') {
                // 保存后直接 refetch：后端注入带完整 capabilities 的 Google 预设模型（disabled）
                void performSave(undefined, true).then(() => void fetchConfig())
            } else {
                void performSave(undefined, true)
            }
            return next
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [t, performSave])

    const deleteProvider = useCallback((providerId: string) => {
        if (PRESET_PROVIDERS.find(p => p.id === providerId)) {
            alert(t('presetProviderCannotDelete'))
            return
        }
        if (confirm(t('confirmDeleteProvider'))) {
            setProviders(prev => {
                const next = prev.filter(p => p.id !== providerId)
                latestProvidersRef.current = next
                return next
            })
            setModels(prev => {
                const nextModels = prev.filter(m => m.provider !== providerId)
                setDefaultModels(prevDefaults => {
                    const updates: DefaultModels = { ...prevDefaults }
                    const remainingModelKeys = new Set(nextModels.map(m => m.modelKey))
                        ; (['analysisModel', 'characterModel', 'locationModel', 'storyboardModel', 'editModel', 'videoModel', 'audioModel', 'lipSyncModel', 'voiceDesignModel'] as const)
                            .forEach(field => {
                                const current = updates[field]
                                if (current && !remainingModelKeys.has(current)) {
                                    updates[field] = ''
                                }
                            })
                    latestDefaultModelsRef.current = updates
                    return updates
                })
                latestModelsRef.current = nextModels
                void performSave(undefined, true) // 删除提供商：立刻保存
                return nextModels
            })
        }
    }, [t, performSave])

    const updateProviderInfo = useCallback((providerId: string, name: string, baseUrl?: string) => {
        setProviders(prev => {
            const next = prev.map(p =>
                p.id === providerId ? { ...p, name, baseUrl } : p
            )
            latestProvidersRef.current = next
            void performSave(undefined, true)
            return next
        })
    }, [performSave])

    const updateProviderBaseUrl = useCallback((providerId: string, baseUrl: string) => {
        setProviders(prev => {
            const next = prev.map(p =>
                p.id === providerId ? { ...p, baseUrl } : p
            )
            latestProvidersRef.current = next
            void performSave(undefined, true)
            return next
        })
    }, [performSave])

    // 模型操作
    const toggleModel = useCallback((modelKey: string, providerId?: string) => {
        if (isPresetComingSoonModelKey(modelKey)) {
            return
        }
        setModels(prev => {
            const next = prev.map(m =>
                m.modelKey === modelKey && (providerId ? m.provider === providerId : true)
                    ? { ...m, enabled: !m.enabled }
                    : m
            )
            latestModelsRef.current = next
            void performSave(undefined, true) // 开关操作：立刻保存
            return next
        })
    }, [performSave])

    const updateModel = useCallback((modelKey: string, updates: Partial<CustomModel>, providerId?: string) => {
        let nextModelKey = ''
        setModels(prev => {
            const next = prev.map(m => {
                if (m.modelKey !== modelKey || (providerId ? m.provider !== providerId : false)) return m
                const mergedProvider = updates.provider ?? m.provider
                const mergedModelId = updates.modelId ?? m.modelId
                nextModelKey = encodeModelKey(mergedProvider, mergedModelId)
                return {
                    ...m,
                    ...updates,
                    provider: mergedProvider,
                    modelId: mergedModelId,
                    modelKey: nextModelKey,
                    name: updates.name ?? m.name,
                    price: updates.price ?? m.price,
                }
            })
            latestModelsRef.current = next
            return next
        })
        if (nextModelKey && nextModelKey !== modelKey) {
            setDefaultModels(prev => {
                const next = { ...prev }
                    ; (['analysisModel', 'characterModel', 'locationModel', 'storyboardModel', 'editModel', 'videoModel', 'audioModel', 'lipSyncModel', 'voiceDesignModel'] as const)
                        .forEach(field => {
                            if (next[field] === modelKey) next[field] = nextModelKey
                        })
                latestDefaultModelsRef.current = next
                return next
            })
        }
        void performSave(undefined, false)
    }, [performSave])

    const addModel = useCallback((model: Omit<CustomModel, 'enabled'>) => {
        setModels(prev => {
            const next = [
                ...prev,
                {
                    ...model,
                    modelKey: model.modelKey || encodeModelKey(model.provider, model.modelId),
                    price: 0,
                    priceLabel: '--',
                    enabled: true,
                },
            ]
            latestModelsRef.current = next
            void performSave(undefined, false)
            return next
        })
    }, [performSave])

    const deleteModel = useCallback((modelKey: string, providerId?: string) => {
        if (PRESET_MODELS.find((model) => {
            const presetModelKey = encodeModelKey(model.provider, model.modelId)
            return presetModelKey === modelKey && (providerId ? model.provider === providerId : true)
        })) {
            alert(t('presetModelCannotDelete'))
            return
        }
        if (confirm(t('confirmDeleteModel'))) {
            setModels(prev => {
                const nextModels = prev.filter(m =>
                    !(m.modelKey === modelKey && (providerId ? m.provider === providerId : true))
                )
                setDefaultModels(prevDefaults => {
                    const nextDefaults = { ...prevDefaults }
                    const remainingModelKeys = new Set(nextModels.map(m => m.modelKey))
                        ; (['analysisModel', 'characterModel', 'locationModel', 'storyboardModel', 'editModel', 'videoModel', 'audioModel', 'lipSyncModel', 'voiceDesignModel'] as const)
                            .forEach(field => {
                                const current = nextDefaults[field]
                                if (current && !remainingModelKeys.has(current)) {
                                    nextDefaults[field] = ''
                                }
                            })
                    latestDefaultModelsRef.current = nextDefaults
                    return nextDefaults
                })
                latestModelsRef.current = nextModels
                void performSave(undefined, true) // 删除模型：立刻保存
                return nextModels
            })
        }
    }, [t, performSave])

    // 过滤器
    const getModelsByType = useCallback((type: CustomModel['type']) => {
        return models.filter(m => m.type === type)
    }, [models])

    return {
        providers,
        models,
        defaultModels,
        workflowConcurrency,
        capabilityDefaults,
        loading,
        saveStatus,
        flushConfig,
        updateProviderHidden,
        updateProviderApiKey,
        updateProviderBaseUrl,
        reorderProviders,
        addProvider,
        deleteProvider,
        updateProviderInfo,
        toggleModel,
        updateModel,
        addModel,
        deleteModel,
        updateDefaultModel,
        batchUpdateDefaultModels,
        updateWorkflowConcurrency,
        updateCapabilityDefault,
        getModelsByType
    }
}
