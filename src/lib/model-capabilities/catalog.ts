import {
  composeModelKey,
  validateModelCapabilities,
  type ModelCapabilities,
  type UnifiedModelType,
} from '@/lib/model-config-contract'
import { ARK_BUILTIN_CAPABILITY_CATALOG_ENTRIES } from '@/lib/ai-providers/ark/models'
import { BAILIAN_BUILTIN_CAPABILITY_CATALOG_ENTRIES } from '@/lib/ai-providers/bailian/models'
import { FAL_BUILTIN_CAPABILITY_CATALOG_ENTRIES } from '@/lib/ai-providers/fal/models'
import { GOOGLE_BUILTIN_CAPABILITY_CATALOG_ENTRIES } from '@/lib/ai-providers/google/models'
import { MINIMAX_BUILTIN_CAPABILITY_CATALOG_ENTRIES } from '@/lib/ai-providers/minimax/models'
import { OPENAI_COMPATIBLE_BUILTIN_CAPABILITY_CATALOG_ENTRIES } from '@/lib/ai-providers/openai-compatible/models'
import { OPENROUTER_BUILTIN_CAPABILITY_CATALOG_ENTRIES } from '@/lib/ai-providers/openrouter/models'
import { SILICONFLOW_BUILTIN_CAPABILITY_CATALOG_ENTRIES } from '@/lib/ai-providers/siliconflow/models'
import { VIDU_BUILTIN_CAPABILITY_CATALOG_ENTRIES } from '@/lib/ai-providers/vidu/models'

export interface BuiltinCapabilityCatalogEntry {
  modelType: UnifiedModelType
  provider: string
  modelId: string
  capabilities?: ModelCapabilities
}

interface CatalogCache {
  signature: string
  entries: BuiltinCapabilityCatalogEntry[]
  exact: Map<string, BuiltinCapabilityCatalogEntry>
  byProviderKey: Map<string, BuiltinCapabilityCatalogEntry>
}

let cache: CatalogCache | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
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

function normalizeEntry(raw: unknown, filePath: string, index: number): BuiltinCapabilityCatalogEntry {
  if (!isRecord(raw)) {
    throw new Error(`CAPABILITY_CATALOG_INVALID: ${filePath}#${index} must be object`)
  }

  const modelTypeRaw = raw.modelType
  if (!isUnifiedModelType(modelTypeRaw)) {
    throw new Error(`CAPABILITY_CATALOG_INVALID: ${filePath}#${index} modelType invalid`)
  }

  const provider = readTrimmedString(raw.provider)
  const modelId = readTrimmedString(raw.modelId)
  if (!provider || !modelId) {
    throw new Error(`CAPABILITY_CATALOG_INVALID: ${filePath}#${index} provider/modelId required`)
  }

  const capabilitiesRaw = raw.capabilities
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
    ...(capabilitiesRaw && isRecord(capabilitiesRaw)
      ? { capabilities: capabilitiesRaw as ModelCapabilities }
      : {}),
  }
}

function buildCache(entries: BuiltinCapabilityCatalogEntry[], signature: string): CatalogCache {
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

const BUILTIN_CATALOG_ENTRIES: readonly unknown[] = [
  ...ARK_BUILTIN_CAPABILITY_CATALOG_ENTRIES,
  ...BAILIAN_BUILTIN_CAPABILITY_CATALOG_ENTRIES,
  ...FAL_BUILTIN_CAPABILITY_CATALOG_ENTRIES,
  ...GOOGLE_BUILTIN_CAPABILITY_CATALOG_ENTRIES,
  ...MINIMAX_BUILTIN_CAPABILITY_CATALOG_ENTRIES,
  ...OPENAI_COMPATIBLE_BUILTIN_CAPABILITY_CATALOG_ENTRIES,
  ...OPENROUTER_BUILTIN_CAPABILITY_CATALOG_ENTRIES,
  ...SILICONFLOW_BUILTIN_CAPABILITY_CATALOG_ENTRIES,
  ...VIDU_BUILTIN_CAPABILITY_CATALOG_ENTRIES,
]

function loadCatalog(): CatalogCache {
  if (cache) return cache
  if (BUILTIN_CATALOG_ENTRIES.length === 0) {
    throw new Error('CAPABILITY_CATALOG_MISSING: empty builtin catalog')
  }

  const entries: BuiltinCapabilityCatalogEntry[] = BUILTIN_CATALOG_ENTRIES.map(
    (entry, index) => normalizeEntry(entry, 'builtin', index),
  )

  cache = buildCache(entries, 'builtin')
  return cache
}

export function listBuiltinCapabilityCatalog(): BuiltinCapabilityCatalogEntry[] {
  return loadCatalog().entries.map((entry) => ({
    ...entry,
    capabilities: cloneCapabilities(entry.capabilities),
  }))
}

/**
 * Provider keys that share capability catalogs with a canonical provider.
 * gemini-compatible uses the same models as google.
 */
const CAPABILITY_PROVIDER_ALIASES: Readonly<Record<string, string>> = {
  'gemini-compatible': 'google',
}

export function findBuiltinCapabilityCatalogEntry(
  modelType: UnifiedModelType,
  provider: string,
  modelId: string,
): BuiltinCapabilityCatalogEntry | null {
  const loaded = loadCatalog()
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

  // Fallback: check canonical provider alias (e.g. gemini-compatible → google)
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

export function resetBuiltinCapabilityCatalogCacheForTest() {
  cache = null
}
