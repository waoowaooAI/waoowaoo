import fs from 'node:fs'
import path from 'node:path'
import { type CapabilityValue } from '@/lib/model-config-contract'

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

const PRICING_CATALOG_DIR = path.resolve(process.cwd(), 'standards/pricing')

let cache: PricingCatalogCache | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isPricingApiType(value: unknown): value is PricingApiType {
  return value === 'text'
    || value === 'image'
    || value === 'video'
    || value === 'voice'
    || value === 'voice-design'
    || value === 'lip-sync'
}

function isCapabilityValue(value: unknown): value is CapabilityValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizePricingTier(raw: unknown, filePath: string, index: number, tierIndex: number): BuiltinPricingTier {
  if (!isRecord(raw)) {
    throw new Error(`PRICING_CATALOG_INVALID: ${filePath}#${index}.tiers[${tierIndex}] must be object`)
  }

  const whenRaw = raw.when
  if (!isRecord(whenRaw) || Object.keys(whenRaw).length === 0) {
    throw new Error(`PRICING_CATALOG_INVALID: ${filePath}#${index}.tiers[${tierIndex}].when must be non-empty object`)
  }

  const when: Record<string, CapabilityValue> = {}
  for (const [field, value] of Object.entries(whenRaw)) {
    if (!isCapabilityValue(value)) {
      throw new Error(`PRICING_CATALOG_INVALID: ${filePath}#${index}.tiers[${tierIndex}].when.${field} must be string/number/boolean`)
    }
    when[field] = value
  }

  const amount = readFiniteNumber(raw.amount)
  if (amount === null || amount < 0) {
    throw new Error(`PRICING_CATALOG_INVALID: ${filePath}#${index}.tiers[${tierIndex}].amount must be finite number >= 0`)
  }

  return {
    when,
    amount,
  }
}

function normalizePricing(raw: unknown, filePath: string, index: number): BuiltinPricingDefinition {
  if (!isRecord(raw)) {
    throw new Error(`PRICING_CATALOG_INVALID: ${filePath}#${index}.pricing must be object`)
  }

  const modeRaw = raw.mode
  if (modeRaw !== 'flat' && modeRaw !== 'capability') {
    throw new Error(`PRICING_CATALOG_INVALID: ${filePath}#${index}.pricing.mode must be flat or capability`)
  }

  if (modeRaw === 'flat') {
    const flatAmount = readFiniteNumber(raw.flatAmount)
    if (flatAmount === null || flatAmount < 0) {
      throw new Error(`PRICING_CATALOG_INVALID: ${filePath}#${index}.pricing.flatAmount must be finite number >= 0`)
    }

    return {
      mode: 'flat',
      flatAmount,
    }
  }

  const tiersRaw = raw.tiers
  if (!Array.isArray(tiersRaw) || tiersRaw.length === 0) {
    throw new Error(`PRICING_CATALOG_INVALID: ${filePath}#${index}.pricing.tiers must be a non-empty array`)
  }

  const tiers = tiersRaw.map((tier, tierIndex) => normalizePricingTier(tier, filePath, index, tierIndex))

  return {
    mode: 'capability',
    tiers,
  }
}

function normalizePricingEntry(raw: unknown, filePath: string, index: number): BuiltinPricingCatalogEntry {
  if (!isRecord(raw)) {
    throw new Error(`PRICING_CATALOG_INVALID: ${filePath}#${index} must be object`)
  }

  const apiTypeRaw = raw.apiType
  if (!isPricingApiType(apiTypeRaw)) {
    throw new Error(`PRICING_CATALOG_INVALID: ${filePath}#${index}.apiType must be one of text/image/video/voice/voice-design/lip-sync`)
  }

  const provider = readTrimmedString(raw.provider)
  const modelId = readTrimmedString(raw.modelId)
  if (!provider || !modelId) {
    throw new Error(`PRICING_CATALOG_INVALID: ${filePath}#${index}.provider/modelId are required`)
  }

  const pricing = normalizePricing(raw.pricing, filePath, index)

  return {
    apiType: apiTypeRaw,
    provider,
    modelId,
    pricing,
  }
}

function buildCache(entries: BuiltinPricingCatalogEntry[]): PricingCatalogCache {
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

  return {
    entries,
    exact,
    byModelId,
  }
}

function cloneEntry(entry: BuiltinPricingCatalogEntry): BuiltinPricingCatalogEntry {
  return JSON.parse(JSON.stringify(entry)) as BuiltinPricingCatalogEntry
}

function loadPricingCatalog(): PricingCatalogCache {
  if (cache) return cache

  const files = fs
    .readdirSync(PRICING_CATALOG_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(PRICING_CATALOG_DIR, entry.name))

  if (files.length === 0) {
    throw new Error(`PRICING_CATALOG_MISSING: no json file in ${PRICING_CATALOG_DIR}`)
  }

  const entries: BuiltinPricingCatalogEntry[] = []
  for (const filePath of files) {
    const raw = fs.readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      throw new Error(`PRICING_CATALOG_INVALID: ${filePath} must be array`)
    }

    for (let index = 0; index < parsed.length; index += 1) {
      entries.push(normalizePricingEntry(parsed[index], filePath, index))
    }
  }

  cache = buildCache(entries)
  return cache
}

export function listBuiltinPricingCatalog(): BuiltinPricingCatalogEntry[] {
  return loadPricingCatalog().entries.map(cloneEntry)
}

/**
 * Provider keys that share pricing catalogs with a canonical provider.
 * e.g. gemini-compatible uses the same models and pricing as google.
 * Defined here so ALL callers automatically benefit — no need to add alias logic per call site.
 */
const PROVIDER_ALIASES: Readonly<Record<string, string>> = {
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
  if (entry) return cloneEntry(entry)

  // Strip composite suffix (e.g. 'gemini-compatible:uuid' → 'gemini-compatible')
  const providerKey = provider.includes(':') ? provider.slice(0, provider.indexOf(':')) : provider
  if (providerKey !== provider) {
    const keyWithProviderKey = `${apiType}::${providerKey}::${modelId}`
    const keyEntry = loaded.exact.get(keyWithProviderKey)
    if (keyEntry) return cloneEntry(keyEntry)
  }

  // Alias fallback: look up the canonical provider
  const aliasTarget = PROVIDER_ALIASES[providerKey]
  if (aliasTarget) {
    const aliasKey = `${apiType}::${aliasTarget}::${modelId}`
    const aliasEntry = loaded.exact.get(aliasKey)
    if (aliasEntry) return cloneEntry(aliasEntry)
  }

  return null
}

export function findBuiltinPricingCatalogEntriesByModelId(
  apiType: PricingApiType,
  modelId: string,
): BuiltinPricingCatalogEntry[] {
  const modelIdKey = `${apiType}::${modelId}`
  const entries = loadPricingCatalog().byModelId.get(modelIdKey) || []
  return entries.map(cloneEntry)
}

export function resetBuiltinPricingCatalogCacheForTest() {
  cache = null
}
