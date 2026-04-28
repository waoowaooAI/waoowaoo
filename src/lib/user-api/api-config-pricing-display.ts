import { composeModelKey } from '@/lib/ai-registry/selection'
import type { ModelCapabilities, UnifiedModelType } from '@/lib/ai-registry/types'
import { resolveBuiltinCapabilitiesByModelKey } from '@/lib/ai-registry/capabilities-catalog'
import { listBuiltinPricingCatalog, type PricingApiType } from '@/lib/ai-registry/pricing-catalog'
import type { PricingDisplayMap, PricingDisplayItem, StoredModel } from './api-config-types'
import { getProviderKey } from './api-config-shared'

const PRICING_PROVIDER_ALIASES: Readonly<Record<string, string>> = {
  'gemini-compatible': 'google',
}

export function formatPriceAmount(amount: number): string {
  const fixed = amount.toFixed(4)
  const normalized = fixed.replace(/\.?0+$/, '')
  return normalized || '0'
}

function pricingApiTypeToModelType(apiType: PricingApiType): UnifiedModelType | null {
  if (apiType === 'text') return 'llm'
  if (apiType === 'image') return 'image'
  if (apiType === 'video') return 'video'
  if (apiType === 'voice') return 'audio'
  if (apiType === 'lip-sync') return 'lipsync'
  return null
}

function composePricingDisplayKey(modelType: UnifiedModelType, provider: string, modelId: string): string {
  return `${modelType}::${provider}::${modelId}`
}

export function resolveBuiltinCapabilities(modelType: UnifiedModelType, provider: string, modelId: string): ModelCapabilities | undefined {
  const modelKey = composeModelKey(provider, modelId)
  if (!modelKey) return undefined
  return resolveBuiltinCapabilitiesByModelKey(modelType, modelKey)
}

function resolveVideoDurationRangeFromCapabilities(
  provider: string,
  modelId: string,
): { min: number; max: number } | null {
  const capabilities = resolveBuiltinCapabilities('video', provider, modelId)
  const options = capabilities?.video?.durationOptions
  if (!Array.isArray(options) || options.length === 0) return null

  const durations = options.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (durations.length === 0) return null
  return {
    min: Math.min(...durations),
    max: Math.max(...durations),
  }
}

function applyVideoDurationRangeIfNeeded(input: {
  apiType: PricingApiType
  provider: string
  modelId: string
  min: number
  max: number
  hasDurationTier: boolean
}): { min: number; max: number } {
  if (input.apiType !== 'video') return { min: input.min, max: input.max }
  if (input.hasDurationTier) return { min: input.min, max: input.max }

  const durationRange = resolveVideoDurationRangeFromCapabilities(input.provider, input.modelId)
  if (!durationRange) return { min: input.min, max: input.max }

  // Ark/视频展示口径：未显式按秒建 tier 时，现有金额按 5 秒基准估算，区间扩展为 [最短秒, 最长秒]。
  const BASE_DURATION_SECONDS = durationRange.min <= 5 && durationRange.max >= 5
    ? 5
    : durationRange.min
  if (BASE_DURATION_SECONDS <= 0) return { min: input.min, max: input.max }

  const scaledMin = input.min * (durationRange.min / BASE_DURATION_SECONDS)
  const scaledMax = input.max * (durationRange.max / BASE_DURATION_SECONDS)
  return {
    min: scaledMin,
    max: scaledMax,
  }
}

export function buildPricingDisplayMap(): PricingDisplayMap {
  const map: PricingDisplayMap = {}
  const entries = listBuiltinPricingCatalog()

  for (const entry of entries) {
    const modelType = pricingApiTypeToModelType(entry.apiType)
    if (!modelType) continue

    let min = 0
    let max = 0
    let input: number | undefined
    let output: number | undefined
    if (entry.pricing.mode === 'flat') {
      const amount = entry.pricing.flatAmount ?? 0
      min = amount
      max = amount
    } else {
      const tiers = entry.pricing.tiers || []
      const amounts = tiers.map((tier) => tier.amount)
      if (amounts.length === 0) continue
      const hasDurationTier = tiers.some((tier) => typeof tier.when.duration === 'number')

      const durationExpanded = applyVideoDurationRangeIfNeeded({
        apiType: entry.apiType,
        provider: entry.provider,
        modelId: entry.modelId,
        min: Math.min(...amounts),
        max: Math.max(...amounts),
        hasDurationTier,
      })
      min = durationExpanded.min
      max = durationExpanded.max

      if (entry.apiType === 'text') {
        for (const tier of tiers) {
          const tokenType = tier.when.tokenType
          if (tokenType === 'input') input = tier.amount
          if (tokenType === 'output') output = tier.amount
        }
      }
    }

    map[composePricingDisplayKey(modelType, entry.provider, entry.modelId)] = {
      min,
      max,
      label: min === max
        ? formatPriceAmount(min)
        : `${formatPriceAmount(min)}~${formatPriceAmount(max)}`,
      ...(typeof input === 'number' ? { input } : {}),
      ...(typeof output === 'number' ? { output } : {}),
    }
  }

  return map
}

function resolvePricingDisplayItem(
  map: PricingDisplayMap,
  modelType: UnifiedModelType,
  provider: string,
  modelId: string,
): PricingDisplayItem | null {
  const exact = map[composePricingDisplayKey(modelType, provider, modelId)]
  if (exact) return exact

  const providerKey = getProviderKey(provider)
  if (providerKey !== provider) {
    const fallback = map[composePricingDisplayKey(modelType, providerKey, modelId)]
    if (fallback) return fallback
  }

  // Fallback: check canonical provider alias (e.g. gemini-compatible → google)
  const aliasTarget = PRICING_PROVIDER_ALIASES[providerKey]
  if (aliasTarget) {
    const aliasFallback = map[composePricingDisplayKey(modelType, aliasTarget, modelId)]
    if (aliasFallback) return aliasFallback
  }
  return null
}

export function withDisplayPricing(model: StoredModel, map: PricingDisplayMap): StoredModel {
  const display = resolvePricingDisplayItem(map, model.type, model.provider, model.modelId)
  if (!display) {
    // Derive display from user custom pricing if available
    if (model.customPricing) {
      const llmPricing = model.customPricing.llm
      if (typeof llmPricing?.inputPerMillion === 'number' && typeof llmPricing.outputPerMillion === 'number') {
        const minPrice = Math.min(llmPricing.inputPerMillion, llmPricing.outputPerMillion)
        const maxPrice = Math.max(llmPricing.inputPerMillion, llmPricing.outputPerMillion)
        return {
          ...model,
          price: minPrice,
          priceMin: minPrice,
          priceMax: maxPrice,
          priceLabel: `${formatPriceAmount(minPrice)}~${formatPriceAmount(maxPrice)}`,
          priceInput: llmPricing.inputPerMillion,
          priceOutput: llmPricing.outputPerMillion,
        }
      }

      const mediaPricing = model.type === 'image'
        ? model.customPricing.image
        : model.type === 'video'
          ? model.customPricing.video
          : undefined
      if (mediaPricing) {
        const basePrice = typeof mediaPricing.basePrice === 'number' ? mediaPricing.basePrice : 0
        let minExtra = 0
        let maxExtra = 0
        if (mediaPricing.optionPrices) {
          for (const optionMap of Object.values(mediaPricing.optionPrices)) {
            const values = Object.values(optionMap).filter((value) => Number.isFinite(value))
            if (values.length === 0) continue
            minExtra += Math.min(...values)
            maxExtra += Math.max(...values)
          }
        }
        const minPrice = basePrice + minExtra
        const maxPrice = basePrice + maxExtra
        return {
          ...model,
          price: minPrice,
          priceMin: minPrice,
          priceMax: maxPrice,
          priceLabel: minPrice === maxPrice
            ? formatPriceAmount(minPrice)
            : `${formatPriceAmount(minPrice)}~${formatPriceAmount(maxPrice)}`,
        }
      }
    }
    return {
      ...model,
      price: 0,
      priceLabel: '--',
      priceMin: undefined,
      priceMax: undefined,
    }
  }

  return {
    ...model,
    price: display.min,
    priceMin: display.min,
    priceMax: display.max,
    priceLabel: display.label,
    ...(typeof display.input === 'number' ? { priceInput: display.input } : {}),
    ...(typeof display.output === 'number' ? { priceOutput: display.output } : {}),
  }
}
