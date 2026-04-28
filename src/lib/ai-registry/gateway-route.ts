import { getProviderKey } from '@/lib/ai-registry/selection'

export type AiGatewayRoute = 'official' | 'openai-compat'
export type AiCompatibleProviderKey = 'openai-compatible'

const COMPATIBLE_PROVIDER_KEYS = new Set<AiCompatibleProviderKey>([
  'openai-compatible',
])
const OFFICIAL_ONLY_PROVIDER_KEYS = new Set([
  'bailian',
  'siliconflow',
])

export function isAiCompatibleProvider(providerId: string): boolean {
  const providerKey = getProviderKey(providerId).toLowerCase()
  return COMPATIBLE_PROVIDER_KEYS.has(providerKey as AiCompatibleProviderKey)
}

export function resolveAiGatewayRoute(providerId: string): AiGatewayRoute {
  const providerKey = getProviderKey(providerId).toLowerCase()
  if (OFFICIAL_ONLY_PROVIDER_KEYS.has(providerKey)) return 'official'
  return isAiCompatibleProvider(providerId) ? 'openai-compat' : 'official'
}
