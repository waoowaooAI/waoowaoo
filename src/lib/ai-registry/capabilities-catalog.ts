import { composeModelKey, parseModelKeyStrict } from '@/lib/ai-registry/selection'
import {
  validateModelCapabilities,
  type CapabilitySelections,
  type CapabilityValue,
  type ModelCapabilities,
  type UnifiedModelType,
} from '@/lib/ai-registry/types'
import {
  cloneCapabilities,
  getProviderKey,
  isCapabilityValue,
  isPlainObject,
  isUnifiedModelType,
  readTrimmedString,
} from './catalog-utils'

// -----------------------------
// Registration (composition root)
// -----------------------------

let registeredCapabilityEntries: readonly unknown[] = []

export function registerBuiltinCapabilityCatalogEntries(entries: readonly unknown[]) {
  registeredCapabilityEntries = entries
  capabilityCache = null
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

function ensureBuiltinCatalogEntriesRegistered() {
  if (registeredCapabilityEntries.length === 0) {
    throw new Error('CAPABILITY_CATALOG_MISSING: empty builtin catalog')
  }
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
  ensureBuiltinCatalogEntriesRegistered()
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
    } else if (input.modelType === 'image' && field === 'resolution') {
      const defaultValue = optionFields[field]?.includes('1K') ? '1K' : optionFields[field]?.[0]
      if (defaultValue !== undefined) {
        options[field] = defaultValue
      }
    }
  }

  return { options, issues: [] }
}
