import { ApiError } from '@/lib/api-errors'
import type { ApiModeType, GatewayRouteType, StoredProvider } from './api-config-types'
import { getProviderKey, isApiMode, isGatewayRoute, isRecord, readTrimmedString } from './api-config-shared'

const OFFICIAL_ONLY_PROVIDER_KEYS = new Set(['bailian', 'siliconflow'])
const RETIRED_PROVIDER_KEYS = new Set(['qwen'])
const MINIMAX_OFFICIAL_BASE_URL = 'https://api.minimaxi.com/v1'

function normalizeMinimaxProviderBaseUrl(input: {
  providerId: string
  baseUrl?: string
  strict: boolean
  field: string
}): string | undefined {
  if (getProviderKey(input.providerId) !== 'minimax') return input.baseUrl
  if (!input.baseUrl) return MINIMAX_OFFICIAL_BASE_URL
  if (input.baseUrl === MINIMAX_OFFICIAL_BASE_URL) return MINIMAX_OFFICIAL_BASE_URL
  if (input.strict) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'PROVIDER_BASEURL_INVALID',
      field: input.field,
    })
  }
  return MINIMAX_OFFICIAL_BASE_URL
}

function resolveProviderGatewayRoute(
  providerId: string,
  rawGatewayRoute: unknown,
): GatewayRouteType {
  const providerKey = getProviderKey(providerId)
  const isOpenAICompatibleProvider = providerKey === 'openai-compatible'
  const isGeminiCompatibleProvider = providerKey === 'gemini-compatible'

  if (rawGatewayRoute !== undefined && !isGatewayRoute(rawGatewayRoute)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'PROVIDER_GATEWAY_ROUTE_INVALID',
    })
  }

  if (isOpenAICompatibleProvider) {
    if (rawGatewayRoute === 'official') {
      throw new ApiError('INVALID_PARAMS', {
        code: 'PROVIDER_GATEWAY_ROUTE_INVALID',
      })
    }
    return 'openai-compat'
  }

  if (isGeminiCompatibleProvider) {
    if (rawGatewayRoute === 'openai-compat') {
      throw new ApiError('INVALID_PARAMS', {
        code: 'PROVIDER_GATEWAY_ROUTE_INVALID',
      })
    }
    return 'official'
  }

  if (OFFICIAL_ONLY_PROVIDER_KEYS.has(providerKey)) {
    if (rawGatewayRoute === 'openai-compat') {
      throw new ApiError('INVALID_PARAMS', {
        code: 'PROVIDER_GATEWAY_ROUTE_INVALID',
      })
    }
    return 'official'
  }

  return rawGatewayRoute === 'openai-compat' ? 'openai-compat' : 'official'
}

export function resolveProviderByIdOrKey(providers: StoredProvider[], providerId: string): StoredProvider | null {
  const exact = providers.find((provider) => provider.id === providerId)
  if (exact) return exact

  const providerKey = getProviderKey(providerId)
  const candidates = providers.filter((provider) => getProviderKey(provider.id) === providerKey)
  if (candidates.length === 0) return null
  if (candidates.length > 1) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'PROVIDER_AMBIGUOUS',
      field: 'providers',
    })
  }

  return candidates[0]
}

export function normalizeProvidersInput(rawProviders: unknown): StoredProvider[] {
  if (rawProviders === undefined) return []
  if (!Array.isArray(rawProviders)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'PROVIDER_PAYLOAD_INVALID',
      field: 'providers',
    })
  }

  const normalized: StoredProvider[] = []
  for (let index = 0; index < rawProviders.length; index += 1) {
    const item = rawProviders[index]
    if (!isRecord(item)) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'PROVIDER_PAYLOAD_INVALID',
        field: `providers[${index}]`,
      })
    }
    const id = readTrimmedString(item.id)
    const name = readTrimmedString(item.name)
    if (!id || !name) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'PROVIDER_PAYLOAD_INVALID',
        field: `providers[${index}]`,
      })
    }
    const normalizedId = id.toLowerCase()
    const providerKey = getProviderKey(normalizedId)
    if (RETIRED_PROVIDER_KEYS.has(providerKey)) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'PROVIDER_NOT_SUPPORTED',
        field: `providers[${index}].id`,
      })
    }
    if (normalized.some((provider) => provider.id.toLowerCase() === normalizedId)) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'PROVIDER_DUPLICATE',
        field: `providers[${index}].id`,
      })
    }
    const apiModeRaw = item.apiMode
    if (apiModeRaw !== undefined && !isApiMode(apiModeRaw)) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'PROVIDER_APIMODE_INVALID',
        field: `providers[${index}].apiMode`,
      })
    }
    if (getProviderKey(id) === 'gemini-compatible' && apiModeRaw === 'openai-official') {
      throw new ApiError('INVALID_PARAMS', {
        code: 'PROVIDER_APIMODE_INVALID',
        field: `providers[${index}].apiMode`,
      })
    }
    let gatewayRoute: GatewayRouteType
    try {
      gatewayRoute = resolveProviderGatewayRoute(id, item.gatewayRoute)
    } catch (error) {
      if (error instanceof ApiError) {
        throw new ApiError('INVALID_PARAMS', {
          code: 'PROVIDER_GATEWAY_ROUTE_INVALID',
          field: `providers[${index}].gatewayRoute`,
        })
      }
      throw error
    }
    const hiddenRaw = item.hidden
    if (hiddenRaw !== undefined && typeof hiddenRaw !== 'boolean') {
      throw new ApiError('INVALID_PARAMS', {
        code: 'PROVIDER_HIDDEN_INVALID',
        field: `providers[${index}].hidden`,
      })
    }

    const baseUrl = normalizeMinimaxProviderBaseUrl({
      providerId: id,
      baseUrl: readTrimmedString(item.baseUrl) || undefined,
      strict: true,
      field: `providers[${index}].baseUrl`,
    })

    normalized.push({
      id,
      name,
      baseUrl,
      apiKey: typeof item.apiKey === 'string' ? item.apiKey.trim() : undefined,
      hidden: hiddenRaw === true,
      apiMode: apiModeRaw,
      gatewayRoute,
    })
  }

  return normalized
}

export function parseStoredProviders(rawProviders: string | null | undefined): StoredProvider[] {
  if (!rawProviders) return []
  let parsedUnknown: unknown
  try {
    parsedUnknown = JSON.parse(rawProviders)
  } catch {
    throw new ApiError('INVALID_PARAMS', {
      code: 'PROVIDER_PAYLOAD_INVALID',
      field: 'customProviders',
    })
  }
  if (!Array.isArray(parsedUnknown)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'PROVIDER_PAYLOAD_INVALID',
      field: 'customProviders',
    })
  }

  const normalized: StoredProvider[] = []
  for (let index = 0; index < parsedUnknown.length; index += 1) {
    const raw = parsedUnknown[index]
    if (!isRecord(raw)) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'PROVIDER_PAYLOAD_INVALID',
        field: `customProviders[${index}]`,
      })
    }

    const id = readTrimmedString(raw.id)
    const name = readTrimmedString(raw.name)
    if (!id || !name) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'PROVIDER_PAYLOAD_INVALID',
        field: `customProviders[${index}]`,
      })
    }

    const providerKey = getProviderKey(id)
    const apiModeRaw = raw.apiMode
    let apiMode: ApiModeType | undefined
    if (apiModeRaw !== undefined) {
      if (!isApiMode(apiModeRaw)) {
        throw new ApiError('INVALID_PARAMS', {
          code: 'PROVIDER_APIMODE_INVALID',
          field: `customProviders[${index}].apiMode`,
        })
      }
      if (providerKey === 'gemini-compatible' && apiModeRaw === 'openai-official') {
        throw new ApiError('INVALID_PARAMS', {
          code: 'PROVIDER_APIMODE_INVALID',
          field: `customProviders[${index}].apiMode`,
        })
      }
      apiMode = apiModeRaw
    }

    let gatewayRoute: GatewayRouteType
    try {
      gatewayRoute = resolveProviderGatewayRoute(id, raw.gatewayRoute)
    } catch {
      throw new ApiError('INVALID_PARAMS', {
        code: 'PROVIDER_GATEWAY_ROUTE_INVALID',
        field: `customProviders[${index}].gatewayRoute`,
      })
    }
    const hiddenRaw = raw.hidden
    if (hiddenRaw !== undefined && typeof hiddenRaw !== 'boolean') {
      throw new ApiError('INVALID_PARAMS', {
        code: 'PROVIDER_HIDDEN_INVALID',
        field: `customProviders[${index}].hidden`,
      })
    }

    const baseUrl = normalizeMinimaxProviderBaseUrl({
      providerId: id,
      baseUrl: readTrimmedString(raw.baseUrl) || undefined,
      strict: false,
      field: `customProviders[${index}].baseUrl`,
    })

    normalized.push({
      id,
      name,
      baseUrl,
      apiKey: typeof raw.apiKey === 'string' ? raw.apiKey.trim() : undefined,
      hidden: hiddenRaw === true,
      apiMode,
      gatewayRoute,
    })
  }

  return normalized
}
