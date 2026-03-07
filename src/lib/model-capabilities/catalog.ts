import fs from 'node:fs'
import path from 'node:path'
import {
  composeModelKey,
  validateModelCapabilities,
  type ModelCapabilities,
  type UnifiedModelType,
} from '@/lib/model-config-contract'

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

const CATALOG_DIR = path.resolve(process.cwd(), 'standards/capabilities')
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

function resolveCatalogFiles(): string[] {
  return fs
    .readdirSync(CATALOG_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(CATALOG_DIR, entry.name))
    .sort((left, right) => left.localeCompare(right))
}

function buildCatalogSignature(files: string[]): string {
  return files
    .map((filePath) => {
      const stat = fs.statSync(filePath)
      return `${filePath}:${stat.mtimeMs}:${stat.size}`
    })
    .join('|')
}

function loadCatalog(): CatalogCache {
  const entries: BuiltinCapabilityCatalogEntry[] = []
  const files = resolveCatalogFiles()

  if (files.length === 0) {
    throw new Error(`CAPABILITY_CATALOG_MISSING: no json file in ${CATALOG_DIR}`)
  }
  const signature = buildCatalogSignature(files)
  if (cache && cache.signature === signature) return cache

  for (const filePath of files) {
    const raw = fs.readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      throw new Error(`CAPABILITY_CATALOG_INVALID: ${filePath} must be array`)
    }
    for (let index = 0; index < parsed.length; index += 1) {
      entries.push(normalizeEntry(parsed[index], filePath, index))
    }
  }

  cache = buildCache(entries, signature)
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
