import type { UnifiedModelType } from '@/lib/ai-registry/types'
import type { OpenAICompatMediaTemplateSource } from '@/lib/ai-registry/openai-compatible-template'
import type { ApiModeType, GatewayRouteType, LlmProtocolType } from './api-config-types'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function getProviderKey(providerId: string): string {
  const index = providerId.indexOf(':')
  return index === -1 ? providerId : providerId.slice(0, index)
}

export function isUnifiedModelType(value: unknown): value is UnifiedModelType {
  return (
    value === 'llm'
    || value === 'image'
    || value === 'video'
    || value === 'audio'
    || value === 'lipsync'
  )
}

export function isApiMode(value: unknown): value is ApiModeType {
  return value === 'gemini-sdk' || value === 'openai-official'
}

export function isGatewayRoute(value: unknown): value is GatewayRouteType {
  return value === 'official' || value === 'openai-compat'
}

export function isLlmProtocol(value: unknown): value is LlmProtocolType {
  return value === 'responses' || value === 'chat-completions'
}

export function isMediaTemplateSource(value: unknown): value is OpenAICompatMediaTemplateSource {
  return value === 'ai' || value === 'manual'
}
