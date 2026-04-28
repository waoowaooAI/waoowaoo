import { composeModelKey, getProviderKey, parseModelKeyStrict } from './selection'
import type { AiUnknownObject, UnifiedModelType } from './types'

export type RuntimeModelMediaType = UnifiedModelType
export type RuntimeGatewayRouteType = 'official' | 'openai-compat'
export type RuntimeLlmProtocolType = 'responses' | 'chat-completions'

export interface RuntimeStoredModel<TCompatMediaTemplate = AiUnknownObject> {
  modelId: string
  modelKey: string
  name: string
  type: UnifiedModelType
  provider: string
  llmProtocol?: RuntimeLlmProtocolType
  compatMediaTemplate?: TCompatMediaTemplate
  price: number
}

export interface RuntimeModelSelection<TCompatMediaTemplate = AiUnknownObject> {
  provider: string
  modelId: string
  modelKey: string
  mediaType: RuntimeModelMediaType
  variantSubKind: 'official' | 'user-template'
  variantData?: { compatMediaTemplate: TCompatMediaTemplate }
  llmProtocol?: RuntimeLlmProtocolType
  compatMediaTemplate?: TCompatMediaTemplate
}

export function normalizeProviderRuntimeBaseUrl(providerId: string, rawBaseUrl?: string): string | undefined {
  const providerKey = getProviderKey(providerId)
  if (providerKey === 'minimax') {
    return 'https://api.minimaxi.com/v1'
  }

  const baseUrl = typeof rawBaseUrl === 'string' ? rawBaseUrl.trim() : ''
  if (!baseUrl) return undefined
  if (providerKey !== 'openai-compatible') return baseUrl

  try {
    const parsed = new URL(baseUrl)
    const pathSegments = parsed.pathname.split('/').filter(Boolean)
    if (pathSegments.includes('v1')) return baseUrl

    const trimmedPath = parsed.pathname.replace(/\/+$/, '')
    parsed.pathname = `${trimmedPath === '' || trimmedPath === '/' ? '' : trimmedPath}/v1`
    return parsed.toString()
  } catch {
    // Keep original value to avoid hiding invalid-config errors.
    return baseUrl
  }
}

function assertRuntimeModelKey(value: string, field: string): { provider: string; modelId: string; modelKey: string } {
  const parsed = parseModelKeyStrict(value)
  if (!parsed) {
    throw new Error(`MODEL_KEY_INVALID: ${field} must be provider::modelId`)
  }
  return parsed
}

export function findRuntimeModelByKey<TCompatMediaTemplate>(
  models: Array<RuntimeStoredModel<TCompatMediaTemplate>>,
  modelKey: string,
): RuntimeStoredModel<TCompatMediaTemplate> | null {
  const parsed = assertRuntimeModelKey(modelKey, 'model')
  return models.find((model) => model.modelId === parsed.modelId && model.provider === parsed.provider) || null
}

function buildRuntimeModelSelection<TCompatMediaTemplate>(
  model: RuntimeStoredModel<TCompatMediaTemplate>,
  mediaType: RuntimeModelMediaType,
): RuntimeModelSelection<TCompatMediaTemplate> {
  const providerKey = getProviderKey(model.provider).toLowerCase()
  const llmProtocol = mediaType === 'llm' && providerKey === 'openai-compatible'
    ? model.llmProtocol
    : undefined
  const compatMediaTemplate = (mediaType === 'image' || mediaType === 'video') && providerKey === 'openai-compatible'
    ? model.compatMediaTemplate
    : undefined
  const variantSubKind = compatMediaTemplate ? 'user-template' as const : 'official' as const
  const variantData = compatMediaTemplate ? { compatMediaTemplate } : undefined

  return {
    provider: model.provider,
    modelId: model.modelId,
    modelKey: composeModelKey(model.provider, model.modelId),
    mediaType,
    variantSubKind,
    ...(variantData ? { variantData } : {}),
    ...(llmProtocol ? { llmProtocol } : {}),
    ...(compatMediaTemplate ? { compatMediaTemplate } : {}),
  }
}

export function resolveRuntimeModelSelection<TCompatMediaTemplate>(
  models: Array<RuntimeStoredModel<TCompatMediaTemplate>>,
  modelKey: string,
  mediaType: RuntimeModelMediaType,
): RuntimeModelSelection<TCompatMediaTemplate> {
  const parsed = assertRuntimeModelKey(modelKey, `${mediaType} model`)
  const exact = findRuntimeModelByKey(models, parsed.modelKey)
  if (!exact || exact.type !== mediaType) {
    throw new Error(`MODEL_NOT_FOUND: ${parsed.modelKey} is not enabled for ${mediaType}`)
  }
  return buildRuntimeModelSelection(exact, mediaType)
}

export function resolveSingleRuntimeModelSelection<TCompatMediaTemplate>(
  models: Array<RuntimeStoredModel<TCompatMediaTemplate>>,
  mediaType: RuntimeModelMediaType,
): RuntimeModelSelection<TCompatMediaTemplate> {
  const candidates = models.filter((model) => model.type === mediaType)
  if (candidates.length === 0) {
    throw new Error(`MODEL_NOT_CONFIGURED: no ${mediaType} model is enabled`)
  }
  if (candidates.length > 1) {
    throw new Error(`MODEL_SELECTION_REQUIRED: multiple ${mediaType} models are enabled, provide model_key explicitly`)
  }

  const model = candidates[0]
  if (!model) {
    throw new Error(`MODEL_NOT_CONFIGURED: no ${mediaType} model is enabled`)
  }
  return buildRuntimeModelSelection(model, mediaType)
}
