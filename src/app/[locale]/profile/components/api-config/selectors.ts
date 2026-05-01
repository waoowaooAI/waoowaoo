import type { CustomModel, PricingDisplayItem, PricingDisplayMap, Provider } from './types'
import { encodeModelKey, getProviderKey, isPresetComingSoonModelKey } from './types'
import type { CapabilitySelections, CapabilityValue } from '@/lib/ai-registry/types'
import {
  DEFAULT_ANALYSIS_WORKFLOW_CONCURRENCY,
  DEFAULT_IMAGE_WORKFLOW_CONCURRENCY,
  DEFAULT_VIDEO_WORKFLOW_CONCURRENCY,
  normalizeWorkflowConcurrencyValue,
} from '@/lib/workflow-concurrency'

export interface WorkflowConcurrency {
  analysis: number
  image: number
  video: number
}

export interface DefaultModels {
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

export interface CapabilityFieldDefaults {
  field: string
  options: CapabilityValue[]
}

export const DEFAULT_MODEL_FIELDS = [
  'analysisModel',
  'characterModel',
  'locationModel',
  'storyboardModel',
  'editModel',
  'videoModel',
  'audioModel',
  'musicModel',
  'lipSyncModel',
  'voiceDesignModel',
] as const satisfies ReadonlyArray<keyof DefaultModels>

export function createInitialProviders(presetProviders: Provider[]): Provider[] {
  return presetProviders.map((provider) => ({ ...provider, apiKey: '', hasApiKey: false }))
}

export function createInitialModels(presetModels: ReadonlyArray<Omit<CustomModel, 'modelKey' | 'price' | 'priceLabel' | 'enabled'> & Partial<Pick<CustomModel, 'modelKey' | 'price' | 'priceLabel' | 'enabled'>>>): CustomModel[] {
  return presetModels.map((model) => {
    const modelKey = encodeModelKey(model.provider, model.modelId)
    return {
      ...model,
      modelKey,
      price: 0,
      priceLabel: '--',
      enabled: !isPresetComingSoonModelKey(modelKey),
    }
  })
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

export function parsePricingDisplayMap(raw: unknown): PricingDisplayMap {
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

export const DEFAULT_WORKFLOW_CONCURRENCY: WorkflowConcurrency = {
  analysis: DEFAULT_ANALYSIS_WORKFLOW_CONCURRENCY,
  image: DEFAULT_IMAGE_WORKFLOW_CONCURRENCY,
  video: DEFAULT_VIDEO_WORKFLOW_CONCURRENCY,
}

export function parseWorkflowConcurrency(raw: unknown): WorkflowConcurrency {
  if (!isRecord(raw)) return DEFAULT_WORKFLOW_CONCURRENCY
  return {
    analysis: normalizeWorkflowConcurrencyValue(raw.analysis, DEFAULT_WORKFLOW_CONCURRENCY.analysis),
    image: normalizeWorkflowConcurrencyValue(raw.image, DEFAULT_WORKFLOW_CONCURRENCY.image),
    video: normalizeWorkflowConcurrencyValue(raw.video, DEFAULT_WORKFLOW_CONCURRENCY.video),
  }
}

const PRICING_DISPLAY_ALIASES: Readonly<Record<string, string>> = {
  'gemini-compatible': 'google',
}

export function resolvePricingDisplay(
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

  const aliasTarget = PRICING_DISPLAY_ALIASES[providerKey]
  if (aliasTarget) {
    const aliasFallback = map[composePricingDisplayKey(type, aliasTarget, modelId)]
    if (aliasFallback) return aliasFallback
  }
  return null
}

export function applyPricingDisplay(model: CustomModel, map: PricingDisplayMap): CustomModel {
  const pricing = resolvePricingDisplay(map, model.type, model.provider, model.modelId)
  if (!pricing) {
    if (model.priceLabel && model.priceLabel !== '--') return model
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

export function normalizeSavedModels(savedModelsRaw: CustomModel[]): CustomModel[] {
  const savedModels: CustomModel[] = []
  const seen = new Set<string>()
  for (const model of savedModelsRaw) {
    const modelKey = model.modelKey || encodeModelKey(model.provider, model.modelId)
    if (seen.has(modelKey)) continue
    seen.add(modelKey)
    savedModels.push({ ...model, modelKey })
  }
  return savedModels
}

export function mergeModelsForDisplay(
  savedModelsRaw: CustomModel[],
  catalogModels: ReadonlyArray<Omit<CustomModel, 'modelKey' | 'price' | 'enabled'> & Partial<Pick<CustomModel, 'modelKey' | 'price' | 'enabled'>>>,
  pricingDisplay: PricingDisplayMap,
): CustomModel[] {
  const savedModels = normalizeSavedModels(savedModelsRaw)
  const hasSavedModels = savedModels.length > 0
  const catalogModelKeys = new Set(catalogModels.map((catalogModel) => encodeModelKey(catalogModel.provider, catalogModel.modelId)))

  const presetModels = catalogModels.map((preset) => {
    const presetModelKey = encodeModelKey(preset.provider, preset.modelId)
    const saved = savedModels.find((model) => model.modelKey === presetModelKey)
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

  const customModels = savedModels
    .filter((model) => !catalogModelKeys.has(model.modelKey))
    .map((model) => applyPricingDisplay({
      ...model,
      enabled: model.enabled !== false,
    }, pricingDisplay))

  return [...presetModels, ...customModels]
}

export function replaceDefaultModelKey(
  defaultModels: DefaultModels,
  previousModelKey: string,
  nextModelKey: string,
): DefaultModels {
  const next = { ...defaultModels }
  for (const field of DEFAULT_MODEL_FIELDS) {
    if (next[field] === previousModelKey) next[field] = nextModelKey
  }
  return next
}

export function clearMissingDefaultModels(
  defaultModels: DefaultModels,
  remainingModelKeys: ReadonlySet<string>,
): DefaultModels {
  const next = { ...defaultModels }
  for (const field of DEFAULT_MODEL_FIELDS) {
    const current = next[field]
    if (current && !remainingModelKeys.has(current)) {
      next[field] = ''
    }
  }
  return next
}

export function applyMissingCapabilityDefaults(
  capabilityDefaults: CapabilitySelections,
  modelKey: string,
  capabilityFields: ReadonlyArray<CapabilityFieldDefaults> | undefined,
): { capabilityDefaults: CapabilitySelections; changed: boolean } {
  if (!capabilityFields || capabilityFields.length === 0) {
    return { capabilityDefaults, changed: false }
  }

  const current = { ...(capabilityDefaults[modelKey] || {}) }
  let changed = false
  for (const definition of capabilityFields) {
    if (current[definition.field] !== undefined) continue
    const firstOption = definition.options[0]
    if (firstOption === undefined) continue
    current[definition.field] = firstOption
    changed = true
  }

  if (!changed) {
    return { capabilityDefaults, changed: false }
  }

  return {
    capabilityDefaults: {
      ...capabilityDefaults,
      [modelKey]: current,
    },
    changed: true,
  }
}
