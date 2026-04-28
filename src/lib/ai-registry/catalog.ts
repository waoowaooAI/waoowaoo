import { composeModelKey, parseModelKeyStrict } from '@/lib/ai-registry/selection'
import {
  validateModelCapabilities,
  type CapabilitySelections,
  type CapabilityValue,
  type CapabilityFieldI18n,
  type ModelCapabilities,
  type VideoCapabilities,
  type UnifiedModelType,
} from '@/lib/ai-registry/types'

// -----------------------------
// Registration (composition root)
// -----------------------------

let registeredCapabilityEntries: readonly unknown[] = []
let registeredPricingEntries: readonly unknown[] = []

export function registerBuiltinCapabilityCatalogEntries(entries: readonly unknown[]) {
  registeredCapabilityEntries = entries
  capabilityCache = null
}

export function registerBuiltinPricingCatalogEntries(entries: readonly unknown[]) {
  registeredPricingEntries = entries
  pricingCache = null
}

// -----------------------------
// Capabilities catalog + lookup
// -----------------------------

export interface BuiltinCapabilityCatalogEntry {
  modelType: UnifiedModelType
  provider: string
  modelId: string
  capabilities?: ModelCapabilities
}

interface CapabilityCatalogCache {
  signature: string
  entries: BuiltinCapabilityCatalogEntry[]
  exact: Map<string, BuiltinCapabilityCatalogEntry>
  byProviderKey: Map<string, BuiltinCapabilityCatalogEntry>
}

let capabilityCache: CapabilityCatalogCache | null = null

function isPlainObject(value: unknown): value is object {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isUnifiedModelType(value: unknown): value is UnifiedModelType {
  return value === 'llm'
    || value === 'image'
    || value === 'video'
    || value === 'audio'
    || value === 'lipsync'
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getProviderKey(providerId: string): string {
  const marker = providerId.indexOf(':')
  return marker === -1 ? providerId : providerId.slice(0, marker)
}

function cloneCapabilities(capabilities: ModelCapabilities | undefined): ModelCapabilities | undefined {
  if (!capabilities) return undefined
  return JSON.parse(JSON.stringify(capabilities)) as ModelCapabilities
}

function normalizeCapabilityEntry(raw: unknown, filePath: string, index: number): BuiltinCapabilityCatalogEntry {
  if (!isPlainObject(raw)) {
    throw new Error(`CAPABILITY_CATALOG_INVALID: ${filePath}#${index} must be object`)
  }

  const modelTypeRaw = Reflect.get(raw, 'modelType')
  if (!isUnifiedModelType(modelTypeRaw)) {
    throw new Error(`CAPABILITY_CATALOG_INVALID: ${filePath}#${index} modelType invalid`)
  }

  const provider = readTrimmedString(Reflect.get(raw, 'provider'))
  const modelId = readTrimmedString(Reflect.get(raw, 'modelId'))
  if (!provider || !modelId) {
    throw new Error(`CAPABILITY_CATALOG_INVALID: ${filePath}#${index} provider/modelId required`)
  }

  const capabilitiesRaw = Reflect.get(raw, 'capabilities')
  const capabilityIssues = validateModelCapabilities(modelTypeRaw, capabilitiesRaw)
  if (capabilityIssues.length > 0) {
    const firstIssue = capabilityIssues[0]
    throw new Error(
      `CAPABILITY_CATALOG_INVALID: ${filePath}#${index} ${firstIssue.code} ${firstIssue.field} ${firstIssue.message}`,
    )
  }

  return {
    modelType: modelTypeRaw,
    provider,
    modelId,
    ...(capabilitiesRaw && isPlainObject(capabilitiesRaw)
      ? { capabilities: capabilitiesRaw as ModelCapabilities }
      : {}),
  }
}

function buildCapabilityCache(entries: BuiltinCapabilityCatalogEntry[], signature: string): CapabilityCatalogCache {
  const exact = new Map<string, BuiltinCapabilityCatalogEntry>()
  const byProviderKey = new Map<string, BuiltinCapabilityCatalogEntry>()

  for (const entry of entries) {
    const modelKey = composeModelKey(entry.provider, entry.modelId)
    if (!modelKey) continue

    const exactKey = `${entry.modelType}::${modelKey}`
    if (exact.has(exactKey)) {
      throw new Error(`CAPABILITY_CATALOG_DUPLICATE: ${exactKey}`)
    }
    exact.set(exactKey, entry)

    const providerKey = getProviderKey(entry.provider)
    const fallbackKey = `${entry.modelType}::${providerKey}::${entry.modelId}`
    if (!byProviderKey.has(fallbackKey)) {
      byProviderKey.set(fallbackKey, entry)
    }
  }

  return { signature, entries, exact, byProviderKey }
}

/**
 * Provider keys that share capability catalogs with a canonical provider.
 * gemini-compatible uses the same models as google.
 */
const CAPABILITY_PROVIDER_ALIASES: Readonly<Record<string, string>> = {
  'gemini-compatible': 'google',
}

function loadCapabilityCatalog(): CapabilityCatalogCache {
  if (capabilityCache) return capabilityCache
  if (registeredCapabilityEntries.length === 0) {
    throw new Error('CAPABILITY_CATALOG_MISSING: empty builtin catalog')
  }

  const entries: BuiltinCapabilityCatalogEntry[] = registeredCapabilityEntries.map(
    (entry, index) => normalizeCapabilityEntry(entry, 'builtin', index),
  )

  capabilityCache = buildCapabilityCache(entries, 'builtin')
  return capabilityCache
}

export function listBuiltinCapabilityCatalog(): BuiltinCapabilityCatalogEntry[] {
  return loadCapabilityCatalog().entries.map((entry) => ({
    ...entry,
    capabilities: cloneCapabilities(entry.capabilities),
  }))
}

export function findBuiltinCapabilityCatalogEntry(
  modelType: UnifiedModelType,
  provider: string,
  modelId: string,
): BuiltinCapabilityCatalogEntry | null {
  const loaded = loadCapabilityCatalog()
  const modelKey = composeModelKey(provider, modelId)
  if (!modelKey) return null

  const exactKey = `${modelType}::${modelKey}`
  const exactMatch = loaded.exact.get(exactKey)
  if (exactMatch) {
    return {
      ...exactMatch,
      capabilities: cloneCapabilities(exactMatch.capabilities),
    }
  }

  const providerKey = getProviderKey(provider)
  const fallbackKey = `${modelType}::${providerKey}::${modelId}`
  const fallback = loaded.byProviderKey.get(fallbackKey)
  if (fallback) {
    return {
      ...fallback,
      capabilities: cloneCapabilities(fallback.capabilities),
    }
  }

  const aliasTarget = CAPABILITY_PROVIDER_ALIASES[providerKey]
  if (aliasTarget) {
    const aliasKey = `${modelType}::${aliasTarget}::${modelId}`
    const aliasMatch = loaded.byProviderKey.get(aliasKey)
    if (aliasMatch) {
      return {
        ...aliasMatch,
        capabilities: cloneCapabilities(aliasMatch.capabilities),
      }
    }
  }

  return null
}

export function findBuiltinCapabilities(
  modelType: UnifiedModelType,
  provider: string,
  modelId: string,
): ModelCapabilities | undefined {
  return findBuiltinCapabilityCatalogEntry(modelType, provider, modelId)?.capabilities
}

export interface CapabilityModelContext {
  modelType: UnifiedModelType
  capabilities?: ModelCapabilities
}

export function resolveBuiltinModelContext(modelType: UnifiedModelType, modelKey: string): CapabilityModelContext | null {
  const parsed = parseModelKeyStrict(modelKey)
  if (!parsed) return null
  const entry = findBuiltinCapabilityCatalogEntry(modelType, parsed.provider, parsed.modelId)
  if (!entry) return null
  return {
    modelType: entry.modelType,
    capabilities: entry.capabilities,
  }
}

export function resolveBuiltinCapabilitiesByModelKey(
  modelType: UnifiedModelType,
  modelKey: string,
): ModelCapabilities | undefined {
  const parsed = parseModelKeyStrict(modelKey)
  if (!parsed) return undefined
  return findBuiltinCapabilities(modelType, parsed.provider, parsed.modelId)
}

export function resetBuiltinCapabilityCatalogCacheForTest() {
  capabilityCache = null
}

// -----------------------------
// Capability selection validation + normalization
// (legacy capability selection utilities)
// -----------------------------

export type CapabilitySelectionValidationCode =
  | 'CAPABILITY_SELECTION_INVALID'
  | 'CAPABILITY_MODEL_UNSUPPORTED'
  | 'CAPABILITY_FIELD_INVALID'
  | 'CAPABILITY_VALUE_NOT_ALLOWED'
  | 'CAPABILITY_REQUIRED'

export interface CapabilitySelectionValidationIssue {
  code: CapabilitySelectionValidationCode
  field: string
  message: string
  allowedValues?: readonly CapabilityValue[]
}

function isCapabilityValue(value: unknown): value is CapabilityValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function getNamespaceCapabilities(
  modelType: UnifiedModelType,
  capabilities: ModelCapabilities | undefined,
): object | null {
  if (!capabilities) return null
  const namespace = capabilities[modelType]
  if (!namespace || !isPlainObject(namespace)) return null
  return namespace
}

export function getCapabilityOptionFields(
  modelType: UnifiedModelType,
  capabilities: ModelCapabilities | undefined,
): Record<string, readonly CapabilityValue[]> {
  const namespace = getNamespaceCapabilities(modelType, capabilities)
  if (!namespace) return {}

  const fields: Record<string, readonly CapabilityValue[]> = {}
  for (const [key, rawValue] of Object.entries(namespace)) {
    if (!key.endsWith('Options')) continue
    if (!Array.isArray(rawValue)) continue
    if (rawValue.length === 0) continue
    if (!rawValue.every((item) => isCapabilityValue(item))) continue
    const field = key.slice(0, -'Options'.length)
    fields[field] = rawValue as CapabilityValue[]
  }
  return fields
}

export function hasCapabilityOptions(
  modelType: UnifiedModelType,
  capabilities: ModelCapabilities | undefined,
): boolean {
  return Object.keys(getCapabilityOptionFields(modelType, capabilities)).length > 0
}

function normalizeSelectionRecord(
  value: unknown,
  field: string,
): { value: Record<string, CapabilityValue> | null; issues: CapabilitySelectionValidationIssue[] } {
  const issues: CapabilitySelectionValidationIssue[] = []
  if (value === undefined || value === null) {
    return { value: null, issues }
  }
  if (!isPlainObject(value)) {
    issues.push({
      code: 'CAPABILITY_SELECTION_INVALID',
      field,
      message: 'selection must be an object',
    })
    return { value: null, issues }
  }

  const normalized: Record<string, CapabilityValue> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (!isCapabilityValue(raw)) {
      issues.push({
        code: 'CAPABILITY_SELECTION_INVALID',
        field: `${field}.${key}`,
        message: 'selection value must be string/number/boolean',
      })
      continue
    }
    normalized[key] = raw
  }
  return { value: normalized, issues }
}

export function validateCapabilitySelectionForModel(input: {
  modelKey: string
  modelType: UnifiedModelType
  capabilities?: ModelCapabilities
  selection?: Record<string, CapabilityValue> | null
  requireAllFields: boolean
}): CapabilitySelectionValidationIssue[] {
  const issues: CapabilitySelectionValidationIssue[] = []
  const optionFields = getCapabilityOptionFields(input.modelType, input.capabilities)
  const optionFieldNames = new Set(Object.keys(optionFields))
  const selection = input.selection || {}

  if (Object.keys(optionFields).length === 0) {
    if (Object.keys(selection).length > 0) {
      issues.push({
        code: 'CAPABILITY_FIELD_INVALID',
        field: `capabilities.${input.modelKey}`,
        message: 'model has no configurable capability options',
      })
    }
    return issues
  }

  for (const [field, value] of Object.entries(selection)) {
    if (!optionFieldNames.has(field)) {
      issues.push({
        code: 'CAPABILITY_FIELD_INVALID',
        field: `capabilities.${input.modelKey}.${field}`,
        message: `field ${field} is not supported by model ${input.modelKey}`,
      })
      continue
    }

    const allowedValues = optionFields[field]
    if (!allowedValues.includes(value)) {
      issues.push({
        code: 'CAPABILITY_VALUE_NOT_ALLOWED',
        field: `capabilities.${input.modelKey}.${field}`,
        message: `value ${String(value)} is not allowed`,
        allowedValues,
      })
    }
  }

  if (input.requireAllFields) {
    for (const field of Object.keys(optionFields)) {
      if (input.modelType === 'image' && field === 'resolution') continue
      if (selection[field] === undefined) {
        issues.push({
          code: 'CAPABILITY_REQUIRED',
          field: `capabilities.${input.modelKey}.${field}`,
          message: `field ${field} is required for model ${input.modelKey}`,
          allowedValues: optionFields[field],
        })
      }
    }
  }

  return issues
}

export function validateCapabilitySelectionsPayload(
  selections: unknown,
  resolveModelContext: (modelKey: string) => CapabilityModelContext | null,
): CapabilitySelectionValidationIssue[] {
  const issues: CapabilitySelectionValidationIssue[] = []

  if (selections === undefined || selections === null) return issues
  if (!isPlainObject(selections)) {
    issues.push({
      code: 'CAPABILITY_SELECTION_INVALID',
      field: 'capabilitySelections',
      message: 'capability selections must be an object',
    })
    return issues
  }

  for (const [modelKey, rawSelection] of Object.entries(selections)) {
    if (!parseModelKeyStrict(modelKey)) {
      issues.push({
        code: 'CAPABILITY_SELECTION_INVALID',
        field: `capabilitySelections.${modelKey}`,
        message: 'model key must be provider::modelId',
      })
      continue
    }

    const context = resolveModelContext(modelKey)
    if (!context) {
      issues.push({
        code: 'CAPABILITY_MODEL_UNSUPPORTED',
        field: `capabilitySelections.${modelKey}`,
        message: `model ${modelKey} is not supported by built-in capability catalog`,
      })
      continue
    }

    const normalizedSelection = normalizeSelectionRecord(
      rawSelection,
      `capabilitySelections.${modelKey}`,
    )
    issues.push(...normalizedSelection.issues)
    if (!normalizedSelection.value) continue

    issues.push(...validateCapabilitySelectionForModel({
      modelKey,
      modelType: context.modelType,
      capabilities: context.capabilities,
      selection: normalizedSelection.value,
      requireAllFields: false,
    }))
  }

  return issues
}

function mergeSelectionRecords(...records: Array<Record<string, CapabilityValue> | undefined>): Record<string, CapabilityValue> {
  const merged: Record<string, CapabilityValue> = {}
  for (const record of records) {
    if (!record) continue
    for (const [field, value] of Object.entries(record)) {
      merged[field] = value
    }
  }
  return merged
}

function pickSelectionForModel(
  selections: CapabilitySelections | undefined,
  modelKey: string,
): Record<string, CapabilityValue> | undefined {
  if (!selections) return undefined
  const selected = selections[modelKey]
  if (!selected || !isPlainObject(selected)) return undefined

  const normalized: Record<string, CapabilityValue> = {}
  for (const [field, rawValue] of Object.entries(selected)) {
    if (field === 'aspectRatio') continue
    if (!isCapabilityValue(rawValue)) continue
    normalized[field] = rawValue
  }
  return normalized
}

export function resolveGenerationOptionsForModel(input: {
  modelType: UnifiedModelType
  modelKey: string
  capabilities?: ModelCapabilities
  capabilityDefaults?: CapabilitySelections
  capabilityOverrides?: CapabilitySelections
  runtimeSelections?: Record<string, CapabilityValue>
  requireAllFields?: boolean
}): { options: Record<string, CapabilityValue>; issues: CapabilitySelectionValidationIssue[] } {
  const defaults = pickSelectionForModel(input.capabilityDefaults, input.modelKey)
  const overrides = pickSelectionForModel(input.capabilityOverrides, input.modelKey)
  const runtime = input.runtimeSelections

  const selection = mergeSelectionRecords(defaults, overrides, runtime)

  if (input.capabilities === undefined) {
    return { options: { ...selection }, issues: [] }
  }

  const normalizedSelection = { ...selection }

  const issues = validateCapabilitySelectionForModel({
    modelKey: input.modelKey,
    modelType: input.modelType,
    capabilities: input.capabilities,
    selection: normalizedSelection,
    requireAllFields: input.requireAllFields ?? true,
  })

  if (issues.length > 0) {
    return { options: {}, issues }
  }

  const optionFields = getCapabilityOptionFields(input.modelType, input.capabilities)
  const options: Record<string, CapabilityValue> = {}
  for (const field of Object.keys(optionFields)) {
    const value = normalizedSelection[field]
    if (value !== undefined) {
      options[field] = value
    }
  }

  return { options, issues: [] }
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

export interface PricingResolutionResolved {
  status: 'resolved'
  entry: BuiltinPricingCatalogEntry
  amount: number
  mode: 'flat' | 'capability'
}

export interface PricingResolutionNotConfigured {
  status: 'not_configured'
}

export interface PricingResolutionAmbiguousModel {
  status: 'ambiguous_model'
  apiType: PricingApiType
  modelId: string
  candidates: BuiltinPricingCatalogEntry[]
}

export interface PricingResolutionMissingCapabilityMatch {
  status: 'missing_capability_match'
  entry: BuiltinPricingCatalogEntry
  selections: Record<string, CapabilityValue>
}

export type PricingResolution =
  | PricingResolutionResolved
  | PricingResolutionNotConfigured
  | PricingResolutionAmbiguousModel
  | PricingResolutionMissingCapabilityMatch

function cloneSelections(raw: Record<string, CapabilityValue> | undefined): Record<string, CapabilityValue> {
  if (!raw) return {}
  const next: Record<string, CapabilityValue> = {}
  for (const [field, value] of Object.entries(raw)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      next[field] = value
    }
  }
  return next
}

function matchTier(entry: BuiltinPricingCatalogEntry, selections: Record<string, CapabilityValue>): number | null {
  const tiers = entry.pricing.tiers || []
  for (const tier of tiers) {
    const matched = Object.entries(tier.when).every(([field, expectedValue]) => selections[field] === expectedValue)
    if (matched) return tier.amount
  }
  return null
}

function resolveEntryByModel(apiType: PricingApiType, model: string): PricingResolution {
  const parsed = parseModelKeyStrict(model)
  if (parsed) {
    const exact = findBuiltinPricingCatalogEntry(apiType, parsed.provider, parsed.modelId)
    if (exact) return { status: 'resolved', entry: exact, amount: 0, mode: exact.pricing.mode }
    return { status: 'not_configured' }
  }

  const candidates = findBuiltinPricingCatalogEntriesByModelId(apiType, model)
  if (candidates.length === 0) return { status: 'not_configured' }
  if (candidates.length > 1) {
    return { status: 'ambiguous_model', apiType, modelId: model, candidates }
  }
  return { status: 'resolved', entry: candidates[0], amount: 0, mode: candidates[0].pricing.mode }
}

export function resolveBuiltinPricing(input: {
  apiType: PricingApiType
  model: string
  selections?: Record<string, CapabilityValue>
}): PricingResolution {
  const entryResolution = resolveEntryByModel(input.apiType, input.model)
  if (entryResolution.status !== 'resolved') return entryResolution

  const { entry } = entryResolution
  if (entry.pricing.mode === 'flat') {
    const amount = entry.pricing.flatAmount
    if (typeof amount !== 'number') {
      return { status: 'missing_capability_match', entry, selections: cloneSelections(input.selections) }
    }
    return { status: 'resolved', entry, amount, mode: 'flat' }
  }

  const selections = cloneSelections(input.selections)
  const amount = matchTier(entry, selections)
  if (amount === null) {
    return { status: 'missing_capability_match', entry, selections }
  }
  return { status: 'resolved', entry, amount, mode: 'capability' }
}

// -----------------------------
// Video pricing tier helpers (legacy pricing utilities)
// -----------------------------

export interface VideoPricingTier {
  when: Record<string, CapabilityValue>
}

function matchesFixedSelections(tier: VideoPricingTier, fixedSelections: Record<string, CapabilityValue>): boolean {
  for (const [field, expectedValue] of Object.entries(fixedSelections)) {
    const tierValue = tier.when[field]
    if (tierValue !== undefined && tierValue !== expectedValue) return false
  }
  return true
}

export function projectVideoPricingTiersByFixedSelections(input: {
  tiers: VideoPricingTier[]
  fixedSelections: Record<string, CapabilityValue>
}): VideoPricingTier[] {
  const { tiers, fixedSelections } = input
  if (tiers.length === 0) return []
  if (Object.keys(fixedSelections).length === 0) {
    return tiers.map((tier) => ({ when: { ...tier.when } }))
  }

  const hiddenFields = new Set(Object.keys(fixedSelections))
  const projected: VideoPricingTier[] = []

  for (const tier of tiers) {
    if (!matchesFixedSelections(tier, fixedSelections)) continue
    const nextWhen: Record<string, CapabilityValue> = {}
    for (const [field, value] of Object.entries(tier.when)) {
      if (hiddenFields.has(field)) continue
      nextWhen[field] = value
    }
    projected.push({ when: nextWhen })
  }

  return projected
}

/**
 * Built-in pricing catalog version used for billing traceability.
 * Bump this value whenever standards/pricing catalog changes semantically.
 */
export const BUILTIN_PRICING_VERSION = '2026-02-19'

// -----------------------------
// Video model helpers (legacy video capability utilities)
// -----------------------------

export interface VideoModelCapabilityCarrier {
  capabilities?: ModelCapabilities
}

function readGenerationModeOptions(model: VideoModelCapabilityCarrier): string[] {
  const options = model.capabilities?.video?.generationModeOptions
  if (!Array.isArray(options)) return []
  return options.filter((value): value is string => typeof value === 'string')
}

export function supportsFirstLastFrame(model: VideoModelCapabilityCarrier): boolean {
  return model.capabilities?.video?.firstlastframe === true
}

export function isFirstLastFrameOnlyModel(model: VideoModelCapabilityCarrier): boolean {
  const generationModeOptions = readGenerationModeOptions(model)
  if (generationModeOptions.length === 0) return false
  return generationModeOptions.every((mode) => mode === 'firstlastframe')
}

export function filterNormalVideoModelOptions<T extends VideoModelCapabilityCarrier>(models: T[]): T[] {
  return models.filter((model) => !isFirstLastFrameOnlyModel(model))
}

export interface EffectiveVideoCapabilityDefinition {
  field: string
  options: CapabilityValue[]
  fieldI18n: CapabilityFieldI18n | null
}

export interface EffectiveVideoCapabilityField extends EffectiveVideoCapabilityDefinition {
  value: CapabilityValue | undefined
}

function parseVideoFieldI18n(raw: unknown): CapabilityFieldI18n | null {
  if (!isPlainObject(raw)) return null
  const labelKey = typeof Reflect.get(raw, 'labelKey') === 'string' && String(Reflect.get(raw, 'labelKey')).trim()
    ? String(Reflect.get(raw, 'labelKey')).trim()
    : undefined
  const unitKey = typeof Reflect.get(raw, 'unitKey') === 'string' && String(Reflect.get(raw, 'unitKey')).trim()
    ? String(Reflect.get(raw, 'unitKey')).trim()
    : undefined

  const optionLabelKeysRaw = Reflect.get(raw, 'optionLabelKeys')
  const optionLabelKeys = isPlainObject(optionLabelKeysRaw)
    ? Object.entries(optionLabelKeysRaw).reduce<Record<string, string>>((acc, [key, value]) => {
      if (typeof value === 'string' && value.trim()) {
        acc[key] = value.trim()
      }
      return acc
    }, {})
    : undefined

  return {
    ...(labelKey ? { labelKey } : {}),
    ...(unitKey ? { unitKey } : {}),
    ...(optionLabelKeys && Object.keys(optionLabelKeys).length > 0 ? { optionLabelKeys } : {}),
  }
}

function pushUnique(target: CapabilityValue[], value: CapabilityValue) {
  if (!target.includes(value)) target.push(value)
}

function collectVideoFieldI18nMap(
  videoCapabilities: VideoCapabilities | undefined,
): Record<string, CapabilityFieldI18n | null> {
  const map: Record<string, CapabilityFieldI18n | null> = {}
  const rawMap = isPlainObject(videoCapabilities?.fieldI18n) ? videoCapabilities.fieldI18n : undefined
  if (!rawMap || !isPlainObject(rawMap)) return map
  for (const [field, raw] of Object.entries(rawMap)) {
    map[field] = parseVideoFieldI18n(raw)
  }
  return map
}

function isCapabilityValueArray(value: unknown): value is CapabilityValue[] {
  return Array.isArray(value) && value.every((item) => isCapabilityValue(item))
}

function buildVideoDefinitionsFromPricingTiers(
  tiers: VideoPricingTier[],
  fieldI18nMap: Record<string, CapabilityFieldI18n | null>,
): EffectiveVideoCapabilityDefinition[] {
  const fieldOrder: string[] = []
  const fieldValues = new Map<string, CapabilityValue[]>()

  for (const tier of tiers) {
    for (const [field, rawValue] of Object.entries(tier.when)) {
      if (!isCapabilityValue(rawValue)) continue
      if (!fieldValues.has(field)) {
        fieldValues.set(field, [])
        fieldOrder.push(field)
      }
      const values = fieldValues.get(field)
      if (!values) continue
      pushUnique(values, rawValue)
    }
  }

  const definitions: EffectiveVideoCapabilityDefinition[] = []
  for (const field of fieldOrder) {
    const options = fieldValues.get(field) || []
    if (options.length === 0) continue
    definitions.push({
      field,
      options,
      fieldI18n: fieldI18nMap[field] || null,
    })
  }
  return definitions
}

function buildVideoDefinitionsFromCapabilities(
  videoCapabilities: VideoCapabilities | undefined,
  fieldI18nMap: Record<string, CapabilityFieldI18n | null>,
): EffectiveVideoCapabilityDefinition[] {
  if (!isPlainObject(videoCapabilities)) return []
  const definitions: EffectiveVideoCapabilityDefinition[] = []

  for (const [key, rawValue] of Object.entries(videoCapabilities)) {
    if (!key.endsWith('Options')) continue
    if (!isCapabilityValueArray(rawValue) || rawValue.length === 0) continue
    const field = key.slice(0, -'Options'.length)
    definitions.push({
      field,
      options: rawValue,
      fieldI18n: fieldI18nMap[field] || null,
    })
  }

  return definitions
}

function hasTierMatch(tiers: VideoPricingTier[], selection: Record<string, CapabilityValue>): boolean {
  if (tiers.length === 0) return true
  return tiers.some((tier) =>
    Object.entries(selection).every(([field, value]) => {
      const tierValue = tier.when[field]
      if (tierValue === undefined) return true
      return tierValue === value
    }))
}

function getCompatibleOptionsForField(input: {
  field: string
  options: CapabilityValue[]
  tiers: VideoPricingTier[]
  selection: Record<string, CapabilityValue>
}): CapabilityValue[] {
  const { field, options, tiers, selection } = input
  if (tiers.length === 0) return options.slice()
  return options.filter((candidate) =>
    hasTierMatch(tiers, {
      ...selection,
      [field]: candidate,
    }))
}

function filterSelectionByDefinitions(
  definitions: EffectiveVideoCapabilityDefinition[],
  selection: Record<string, CapabilityValue> | undefined,
): Record<string, CapabilityValue> {
  if (!selection) return {}
  const fields = new Set(definitions.map((definition) => definition.field))
  const next: Record<string, CapabilityValue> = {}
  for (const [field, value] of Object.entries(selection)) {
    if (!fields.has(field)) continue
    if (!isCapabilityValue(value)) continue
    next[field] = value
  }
  return next
}

export function resolveEffectiveVideoCapabilityDefinitions(input: {
  videoCapabilities?: VideoCapabilities
  pricingTiers?: VideoPricingTier[]
}): EffectiveVideoCapabilityDefinition[] {
  const tiers = input.pricingTiers || []
  const fieldI18nMap = collectVideoFieldI18nMap(input.videoCapabilities)
  const capabilityDefinitions = buildVideoDefinitionsFromCapabilities(input.videoCapabilities, fieldI18nMap)

  if (capabilityDefinitions.length > 0) {
    return capabilityDefinitions
  }

  if (tiers.length > 0) {
    return buildVideoDefinitionsFromPricingTiers(tiers, fieldI18nMap)
  }

  return []
}

export function normalizeVideoGenerationSelections(input: {
  definitions: EffectiveVideoCapabilityDefinition[]
  pricingTiers?: VideoPricingTier[]
  selection?: Record<string, CapabilityValue>
  pinnedFields?: string[]
}): Record<string, CapabilityValue> {
  const tiers = input.pricingTiers || []
  const normalized = filterSelectionByDefinitions(input.definitions, input.selection)
  const pinnedFieldSet = new Set(input.pinnedFields || [])
  const orderedDefinitions = input.definitions.slice().sort((left, right) => {
    const leftPinned = pinnedFieldSet.has(left.field)
    const rightPinned = pinnedFieldSet.has(right.field)
    if (leftPinned === rightPinned) return 0
    return leftPinned ? 1 : -1
  })

  if (input.definitions.length === 0) return {}

  let changed = true
  let attempts = 0
  const maxAttempts = Math.max(4, input.definitions.length * 3)
  while (changed && attempts < maxAttempts) {
    attempts += 1
    changed = false

    for (const definition of orderedDefinitions) {
      const compatibleOptions = getCompatibleOptionsForField({
        field: definition.field,
        options: definition.options,
        tiers,
        selection: normalized,
      })

      const current = normalized[definition.field]
      if (compatibleOptions.length === 0) {
        if (current !== undefined) {
          delete normalized[definition.field]
          changed = true
        }
        continue
      }

      if (current === undefined || !compatibleOptions.includes(current)) {
        normalized[definition.field] = compatibleOptions[0]
        changed = true
      }
    }
  }

  return normalized
}

export function resolveEffectiveVideoCapabilityFields(input: {
  definitions: EffectiveVideoCapabilityDefinition[]
  pricingTiers?: VideoPricingTier[]
  selection?: Record<string, CapabilityValue>
}): EffectiveVideoCapabilityField[] {
  const tiers = input.pricingTiers || []
  const normalized = normalizeVideoGenerationSelections({
    definitions: input.definitions,
    pricingTiers: tiers,
    selection: input.selection,
  })

  return input.definitions.map((definition) => {
    const options = getCompatibleOptionsForField({
      field: definition.field,
      options: definition.options,
      tiers,
      selection: normalized,
    })
    const value = normalized[definition.field]
    return {
      ...definition,
      options,
      value: value !== undefined && options.includes(value) ? value : undefined,
    }
  })
}
