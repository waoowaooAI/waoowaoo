import OpenAI from 'openai'
import { ApiError } from '@/lib/api-errors'

export type ProviderModelKind = 'llm' | 'image' | 'video' | 'audio'

export interface FetchProviderModelsPayload {
  providerId?: string
  provider?: string
  baseUrl?: string
  apiKey?: string
  extraHeaders?: Record<string, string>
  apiMode?: 'gemini-sdk' | 'openai-official'
}

export interface NormalizedProviderModel {
  modelId: string
  name: string
  type: ProviderModelKind
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseProviderKey(providerId?: string): string {
  const normalized = readTrimmedString(providerId)
  const marker = normalized.indexOf(':')
  return marker === -1 ? normalized : normalized.slice(0, marker)
}

function normalizeExtraHeaders(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'string') continue
    const headerKey = key.trim()
    const headerValue = value.trim()
    if (!headerKey || !headerValue) continue
    out[headerKey] = headerValue
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function normalizeModelType(modelId: string): ProviderModelKind {
  const normalized = modelId.toLowerCase()
  if (normalized.includes('image') || normalized.startsWith('gpt-image')) return 'image'
  if (normalized.includes('sora') || normalized.includes('video') || normalized.includes('veo')) return 'video'
  if (normalized.includes('audio') || normalized.includes('tts') || normalized.includes('voice')) return 'audio'
  return 'llm'
}

function normalizeBaseUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl)
    if (!url.pathname || url.pathname === '/') {
      url.pathname = '/v1'
      return url.toString()
    }
    return baseUrl
  } catch {
    return baseUrl
  }
}

export async function fetchProviderModels(payload: FetchProviderModelsPayload): Promise<NormalizedProviderModel[]> {
  const providerKey = parseProviderKey(payload.providerId)
  if (providerKey !== 'openai-compatible') {
    throw new ApiError('INVALID_PARAMS', { message: 'Only openai-compatible is supported for fetch-models' })
  }

  const baseUrl = readTrimmedString(payload.baseUrl)
  if (!baseUrl) {
    throw new ApiError('INVALID_PARAMS', { message: 'baseUrl is required' })
  }

  const client = new OpenAI({
    apiKey: readTrimmedString(payload.apiKey) || 'no-key',
    baseURL: normalizeBaseUrl(baseUrl),
    defaultHeaders: normalizeExtraHeaders(payload.extraHeaders),
    timeout: 30000,
  })

  const response = await client.models.list()
  const normalized = response.data
    .map((model) => {
      const modelId = readTrimmedString(model.id)
      if (!modelId) return null
      return {
        modelId,
        name: modelId,
        type: normalizeModelType(modelId),
      } satisfies NormalizedProviderModel
    })
    .filter((model): model is NormalizedProviderModel => model !== null)

  const deduped = new Map<string, NormalizedProviderModel>()
  for (const model of normalized) {
    deduped.set(model.modelId, model)
  }

  return Array.from(deduped.values()).sort((a, b) => a.modelId.localeCompare(b.modelId))
}
