import { BUILTIN_PRICING_CATALOG_ENTRIES } from '@/lib/ai-providers/builtin-catalog'
import type { CapabilityValue } from '@/lib/ai-registry/types'
import { isCapabilityValue, isPlainObject, readTrimmedString } from './catalog-utils'

let registeredPricingEntries: readonly unknown[] = []

export function registerBuiltinPricingCatalogEntries(entries: readonly unknown[]) {
  registeredPricingEntries = entries
  pricingCache = null
}

function ensureBuiltinPricingCatalogEntriesRegistered() {
  if (registeredPricingEntries.length === 0) {
    registerBuiltinPricingCatalogEntries(BUILTIN_PRICING_CATALOG_ENTRIES)
  }
}

// -----------------------------
// Pricing catalog + lookup
// -----------------------------

export type PricingApiType =
  | 'text'
  | 'image'
  | 'video'
  | 'voice'
  | 'voice-design'
  | 'lip-sync'

export interface BuiltinPricingTier {
  when: Record<string, CapabilityValue>
  amount: number
}

export interface BuiltinPricingDefinition {
  mode: 'flat' | 'capability'
  flatAmount?: number
  tiers?: BuiltinPricingTier[]
}

export interface BuiltinPricingCatalogEntry {
  apiType: PricingApiType
  provider: string
  modelId: string
  pricing: BuiltinPricingDefinition
}

interface PricingCatalogCache {
  entries: BuiltinPricingCatalogEntry[]
  exact: Map<string, BuiltinPricingCatalogEntry>
  byModelId: Map<string, BuiltinPricingCatalogEntry[]>
}

let pricingCache: PricingCatalogCache | null = null

function isPricingApiType(value: unknown): value is PricingApiType {
  return value === 'text'
    || value === 'image'
    || value === 'video'
    || value === 'voice'
    || value === 'voice-design'
    || value === 'lip-sync'
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizePricingTier(raw: unknown, filePath: string, index: number, tierIndex: number): BuiltinPricingTier {
  if (!isPlainObject(raw)) {
    throw new Error(`PRICING_CATALOG_INVALID: ${filePath}#${index}.tiers[${tierIndex}] must be object`)
  }

  const whenRaw = Reflect.get(raw, 'when')
  if (!isPlainObject(whenRaw) || Object.keys(whenRaw).length === 0) {
    throw new Error(`PRICING_CATALOG_INVALID: ${filePath}#${index}.tiers[${tierIndex}].when must be non-empty object`)
  }

  const when: Record<string, CapabilityValue> = {}
  for (const [field, value] of Object.entries(whenRaw)) {
    if (!isCapabilityValue(value)) {
      throw new Error(`PRICING_CATALOG_INVALID: ${filePath}#${index}.tiers[${tierIndex}].when.${field} must be string/number/boolean`)
    }
    when[field] = value
  }

  const amount = readFiniteNumber(Reflect.get(raw, 'amount'))
  if (amount === null || amount < 0) {
    throw new Error(`PRICING_CATALOG_INVALID: ${filePath}#${index}.tiers[${tierIndex}].amount must be finite number >= 0`)
  }

  return { when, amount }
}

function normalizePricing(raw: unknown, filePath: string, index: number): BuiltinPricingDefinition {
  if (!isPlainObject(raw)) {
    throw new Error(`PRICING_CATALOG_INVALID: ${filePath}#${index}.pricing must be object`)
  }

  const modeRaw = Reflect.get(raw, 'mode')
  if (modeRaw !== 'flat' && modeRaw !== 'capability') {
    throw new Error(`PRICING_CATALOG_INVALID: ${filePath}#${index}.pricing.mode must be flat or capability`)
  }

  if (modeRaw === 'flat') {
    const flatAmount = readFiniteNumber(Reflect.get(raw, 'flatAmount'))
    if (flatAmount === null || flatAmount < 0) {
      throw new Error(`PRICING_CATALOG_INVALID: ${filePath}#${index}.pricing.flatAmount must be finite number >= 0`)
    }
    return { mode: 'flat', flatAmount }
  }

  const tiersRaw = Reflect.get(raw, 'tiers')
  if (!Array.isArray(tiersRaw) || tiersRaw.length === 0) {
    throw new Error(`PRICING_CATALOG_INVALID: ${filePath}#${index}.pricing.tiers must be a non-empty array`)
  }

  const tiers = tiersRaw.map((tier, tierIndex) => normalizePricingTier(tier, filePath, index, tierIndex))
  return { mode: 'capability', tiers }
}

function normalizePricingEntry(raw: unknown, filePath: string, index: number): BuiltinPricingCatalogEntry {
  if (!isPlainObject(raw)) {
    throw new Error(`PRICING_CATALOG_INVALID: ${filePath}#${index} must be object`)
  }

  const apiTypeRaw = Reflect.get(raw, 'apiType')
  if (!isPricingApiType(apiTypeRaw)) {
    throw new Error(`PRICING_CATALOG_INVALID: ${filePath}#${index}.apiType must be one of text/image/video/voice/voice-design/lip-sync`)
  }

  const provider = readTrimmedString(Reflect.get(raw, 'provider'))
  const modelId = readTrimmedString(Reflect.get(raw, 'modelId'))
  if (!provider || !modelId) {
    throw new Error(`PRICING_CATALOG_INVALID: ${filePath}#${index}.provider/modelId are required`)
  }

  const pricing = normalizePricing(Reflect.get(raw, 'pricing'), filePath, index)

  return { apiType: apiTypeRaw, provider, modelId, pricing }
}

function buildPricingCache(entries: BuiltinPricingCatalogEntry[]): PricingCatalogCache {
  const exact = new Map<string, BuiltinPricingCatalogEntry>()
  const byModelId = new Map<string, BuiltinPricingCatalogEntry[]>()

  for (const entry of entries) {
    const exactKey = `${entry.apiType}::${entry.provider}::${entry.modelId}`
    if (exact.has(exactKey)) {
      throw new Error(`PRICING_CATALOG_DUPLICATE: ${exactKey}`)
    }
    exact.set(exactKey, entry)

    const modelIdKey = `${entry.apiType}::${entry.modelId}`
    const group = byModelId.get(modelIdKey) || []
    group.push(entry)
    byModelId.set(modelIdKey, group)
  }

  return { entries, exact, byModelId }
}

function clonePricingEntry(entry: BuiltinPricingCatalogEntry): BuiltinPricingCatalogEntry {
  return JSON.parse(JSON.stringify(entry)) as BuiltinPricingCatalogEntry
}

function loadPricingCatalog(): PricingCatalogCache {
  if (pricingCache) return pricingCache
  ensureBuiltinPricingCatalogEntriesRegistered()
  if (registeredPricingEntries.length === 0) {
    throw new Error('PRICING_CATALOG_MISSING: empty builtin catalog')
  }

  const entries: BuiltinPricingCatalogEntry[] = []
  for (let index = 0; index < registeredPricingEntries.length; index += 1) {
    entries.push(normalizePricingEntry(registeredPricingEntries[index], 'builtin', index))
  }

  pricingCache = buildPricingCache(entries)
  return pricingCache
}

export function listBuiltinPricingCatalog(): BuiltinPricingCatalogEntry[] {
  return loadPricingCatalog().entries.map(clonePricingEntry)
}

const PRICING_PROVIDER_ALIASES: Readonly<Record<string, string>> = {
  'gemini-compatible': 'google',
}

export function findBuiltinPricingCatalogEntry(
  apiType: PricingApiType,
  provider: string,
  modelId: string,
): BuiltinPricingCatalogEntry | null {
  const loaded = loadPricingCatalog()

  const exactKey = `${apiType}::${provider}::${modelId}`
  const entry = loaded.exact.get(exactKey)
  if (entry) return clonePricingEntry(entry)

  const providerKey = provider.includes(':') ? provider.slice(0, provider.indexOf(':')) : provider
  if (providerKey !== provider) {
    const keyWithProviderKey = `${apiType}::${providerKey}::${modelId}`
    const keyEntry = loaded.exact.get(keyWithProviderKey)
    if (keyEntry) return clonePricingEntry(keyEntry)
  }

  const aliasTarget = PRICING_PROVIDER_ALIASES[providerKey]
  if (aliasTarget) {
    const aliasKey = `${apiType}::${aliasTarget}::${modelId}`
    const aliasEntry = loaded.exact.get(aliasKey)
    if (aliasEntry) return clonePricingEntry(aliasEntry)
  }

  return null
}

export function findBuiltinPricingCatalogEntriesByModelId(
  apiType: PricingApiType,
  modelId: string,
): BuiltinPricingCatalogEntry[] {
  const loaded = loadPricingCatalog()
  const key = `${apiType}::${modelId}`
  const group = loaded.byModelId.get(key) || []
  return group.map(clonePricingEntry)
}
