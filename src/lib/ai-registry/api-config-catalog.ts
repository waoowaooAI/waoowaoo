import { composeModelKey, parseModelKeyStrict } from '@/lib/ai-registry/selection'
import type { ModelCapabilities, UnifiedModelType } from '@/lib/ai-registry/types'
import { resolveBuiltinCapabilitiesByModelKey } from './capabilities-catalog'
import { cloneCapabilities, isPlainObject, isUnifiedModelType, readTrimmedString } from './catalog-utils'

// -----------------------------
// API config server catalog
// -----------------------------

export interface ApiConfigCatalogProvider {
  id: string
  name: string
  baseUrl?: string
}

export interface ApiConfigCatalogModel {
  modelId: string
  name: string
  type: UnifiedModelType
  provider: string
  capabilities?: ModelCapabilities
}

export interface ApiConfigServerCatalog {
  providers: ApiConfigCatalogProvider[]
  models: ApiConfigCatalogModel[]
}

export const DEFAULT_LIPSYNC_MODEL_KEY = 'fal::fal-ai/kling-video/lipsync/audio-to-video'
export const DEFAULT_VOICE_MODEL_KEY = 'fal::fal-ai/index-tts-2/text-to-speech'
export const DEFAULT_VOICE_DESIGN_MODEL_KEY = 'bailian::qwen-voice-design'

interface BuiltinApiConfigCatalogRegistration {
  models: readonly unknown[]
  googleCompatibleModels: readonly ApiConfigCatalogModel[]
  defaultLipSyncModelKey: string
  defaultVoiceModelKey: string
  defaultVoiceDesignModelKey: string
}

let registeredApiConfigCatalog: BuiltinApiConfigCatalogRegistration | null = null
let apiConfigCatalogModelCache: ApiConfigCatalogModel[] | null = null

export function registerBuiltinApiConfigCatalog(input: BuiltinApiConfigCatalogRegistration) {
  registeredApiConfigCatalog = input
  apiConfigCatalogModelCache = null
}

function requireBuiltinApiConfigCatalog(): BuiltinApiConfigCatalogRegistration {
  if (!registeredApiConfigCatalog) {
    throw new Error('API_CONFIG_CATALOG_MISSING: empty builtin catalog')
  }
  return registeredApiConfigCatalog
}

export function getDefaultLipSyncModelKey(): string {
  return registeredApiConfigCatalog?.defaultLipSyncModelKey ?? DEFAULT_LIPSYNC_MODEL_KEY
}

export function getDefaultVoiceModelKey(): string {
  return registeredApiConfigCatalog?.defaultVoiceModelKey ?? DEFAULT_VOICE_MODEL_KEY
}

export function getDefaultVoiceDesignModelKey(): string {
  return registeredApiConfigCatalog?.defaultVoiceDesignModelKey ?? DEFAULT_VOICE_DESIGN_MODEL_KEY
}

export const API_CONFIG_CATALOG_PROVIDERS: ApiConfigCatalogProvider[] = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'ark', name: 'Volcengine Ark' },
  { id: 'google', name: 'Google AI Studio' },
  { id: 'bailian', name: 'Alibaba Bailian' },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'minimax', name: 'MiniMax Hailuo', baseUrl: 'https://api.minimaxi.com/v1' },
  { id: 'vidu', name: 'Vidu' },
  { id: 'fal', name: 'FAL' },
]

const CATALOG_PROVIDER_ORDER = new Map(API_CONFIG_CATALOG_PROVIDERS.map((provider, index) => [provider.id, index]))
const CATALOG_TYPE_ORDER: Readonly<Record<UnifiedModelType, number>> = {
  llm: 0,
  image: 1,
  video: 2,
  audio: 3,
  lipsync: 4,
}

function normalizeApiConfigCatalogModel(raw: unknown, index: number): ApiConfigCatalogModel {
  if (!isPlainObject(raw)) {
    throw new Error(`API_CONFIG_CATALOG_INVALID: builtin#${index} must be object`)
  }

  const modelTypeRaw = Reflect.get(raw, 'type')
  if (!isUnifiedModelType(modelTypeRaw)) {
    throw new Error(`API_CONFIG_CATALOG_INVALID: builtin#${index} type invalid`)
  }

  const provider = readTrimmedString(Reflect.get(raw, 'provider'))
  const modelId = readTrimmedString(Reflect.get(raw, 'modelId'))
  const name = readTrimmedString(Reflect.get(raw, 'name'))
  if (!provider || !modelId || !name) {
    throw new Error(`API_CONFIG_CATALOG_INVALID: builtin#${index} provider/modelId/name required`)
  }

  return {
    modelId,
    name,
    type: modelTypeRaw,
    provider,
  }
}

function buildApiConfigCatalogModels(): ApiConfigCatalogModel[] {
  const catalog = requireBuiltinApiConfigCatalog()
  const byKey = new Map<string, ApiConfigCatalogModel>()

  for (let index = 0; index < catalog.models.length; index += 1) {
    const model = normalizeApiConfigCatalogModel(catalog.models[index], index)
    const modelKey = composeModelKey(model.provider, model.modelId)
    const capabilities = resolveBuiltinCapabilitiesByModelKey(model.type, modelKey)
    byKey.set(`${model.type}::${modelKey}`, {
      ...model,
      ...(capabilities ? { capabilities: cloneCapabilities(capabilities) } : {}),
    })
  }

  return Array.from(byKey.values()).sort((left, right) => {
    const providerDelta = (CATALOG_PROVIDER_ORDER.get(left.provider) ?? 999) - (CATALOG_PROVIDER_ORDER.get(right.provider) ?? 999)
    if (providerDelta !== 0) return providerDelta
    const typeDelta = CATALOG_TYPE_ORDER[left.type] - CATALOG_TYPE_ORDER[right.type]
    if (typeDelta !== 0) return typeDelta
    return left.name.localeCompare(right.name)
  })
}

export function listApiConfigCatalogModels(): ApiConfigCatalogModel[] {
  if (!apiConfigCatalogModelCache) {
    apiConfigCatalogModelCache = buildApiConfigCatalogModels()
  }
  return apiConfigCatalogModelCache.map((model) => ({
    ...model,
    capabilities: cloneCapabilities(model.capabilities),
  }))
}

export const API_CONFIG_PRESET_COMING_SOON_MODEL_KEYS = new Set<string>([])

export function isApiConfigPresetComingSoonModel(provider: string, modelId: string): boolean {
  return API_CONFIG_PRESET_COMING_SOON_MODEL_KEYS.has(encodeApiConfigModelKey(provider, modelId))
}

export function isApiConfigPresetComingSoonModelKey(modelKey: string): boolean {
  return API_CONFIG_PRESET_COMING_SOON_MODEL_KEYS.has(modelKey)
}

export function getApiConfigProviderKey(providerId?: string): string {
  if (!providerId) return ''
  const colonIndex = providerId.indexOf(':')
  return colonIndex === -1 ? providerId : providerId.slice(0, colonIndex)
}

export function encodeApiConfigModelKey(provider: string, modelId: string): string {
  return composeModelKey(provider, modelId)
}

export function parseApiConfigModelKey(key: string | undefined | null): { provider: string; modelId: string } | null {
  const parsed = parseModelKeyStrict(key)
  if (!parsed) return null
  return {
    provider: parsed.provider,
    modelId: parsed.modelId,
  }
}

export function matchesApiConfigModelKey(key: string | undefined | null, provider: string, modelId: string): boolean {
  const parsed = parseModelKeyStrict(key)
  if (!parsed) return false
  return parsed.provider === provider && parsed.modelId === modelId
}

const ZH_PROVIDER_NAME_MAP: Readonly<Record<string, string>> = {
  ark: '火山引擎 Ark',
  minimax: '海螺 MiniMax',
  vidu: '生数科技 Vidu',
  bailian: '阿里云百炼',
  siliconflow: '硅基流动',
}

function isZhLocale(locale?: string): boolean {
  return typeof locale === 'string' && locale.toLowerCase().startsWith('zh')
}

export function resolveApiConfigCatalogProviderName(providerId: string, fallbackName: string, locale?: string): string {
  if (!isZhLocale(locale)) return fallbackName
  return ZH_PROVIDER_NAME_MAP[providerId] ?? fallbackName
}

export function getApiConfigProviderDisplayName(providerId?: string, locale?: string): string {
  if (!providerId) return ''
  const providerKey = getApiConfigProviderKey(providerId)
  const provider = API_CONFIG_CATALOG_PROVIDERS.find((candidate) => candidate.id === providerKey)
  if (!provider) return providerId
  return resolveApiConfigCatalogProviderName(provider.id, provider.name, locale)
}

export function getGoogleCompatibleApiConfigPresetModels(providerId: string): ApiConfigCatalogModel[] {
  return requireBuiltinApiConfigCatalog().googleCompatibleModels
    .map((model) => ({ ...model, provider: providerId }))
}

export function buildApiConfigServerCatalog(input?: {
  resolveCapabilities?: (model: ApiConfigCatalogModel) => ModelCapabilities | undefined
}): ApiConfigServerCatalog {
  return {
    providers: API_CONFIG_CATALOG_PROVIDERS.map((provider) => ({ ...provider })),
    models: listApiConfigCatalogModels().map((model) => {
      const capabilities = input?.resolveCapabilities
        ? input.resolveCapabilities(model)
        : model.capabilities
      return {
        ...model,
        ...(capabilities ? { capabilities: cloneCapabilities(capabilities) } : {}),
      }
    }),
  }
}
