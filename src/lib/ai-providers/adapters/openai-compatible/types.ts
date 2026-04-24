import type { OpenAICompatMediaTemplate } from '@/lib/openai-compat-media-template'
import type { AiCompatibleProviderKey } from '@/lib/ai-registry/gateway-route'

export type OpenAICompatImageProfile = AiCompatibleProviderKey
export type OpenAICompatVideoProfile = 'openai-compatible'

export interface OpenAICompatClientConfig {
  providerId: string
  baseUrl: string
  apiKey: string
}

export interface OpenAICompatImageRequest {
  userId: string
  providerId: string
  modelId?: string
  prompt: string
  referenceImages?: string[]
  options?: Record<string, unknown>
  profile: OpenAICompatImageProfile
  template?: OpenAICompatMediaTemplate
  modelKey?: string
}

export interface OpenAICompatVideoRequest {
  userId: string
  providerId: string
  modelId?: string
  imageUrl: string
  prompt: string
  options?: Record<string, unknown>
  profile: OpenAICompatVideoProfile
  template?: OpenAICompatMediaTemplate
  modelKey?: string
}

export interface OpenAICompatChatRequest {
  userId: string
  providerId: string
  modelId: string
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  temperature: number
}
