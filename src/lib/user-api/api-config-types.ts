import type { ModelCapabilities, UnifiedModelType } from '@/lib/ai-registry/types'
import type { OpenAICompatMediaTemplate, OpenAICompatMediaTemplateSource } from '@/lib/ai-registry/openai-compatible-template'

export type ApiModeType = 'gemini-sdk' | 'openai-official'
export type GatewayRouteType = 'official' | 'openai-compat'
export type LlmProtocolType = 'responses' | 'chat-completions'
export type DefaultModelField =
  | 'analysisModel'
  | 'characterModel'
  | 'locationModel'
  | 'storyboardModel'
  | 'editModel'
  | 'videoModel'
  | 'audioModel'
  | 'musicModel'
  | 'lipSyncModel'
  | 'voiceDesignModel'

export interface StoredProvider {
  id: string
  name: string
  baseUrl?: string
  apiKey?: string
  hidden?: boolean
  apiMode?: ApiModeType
  gatewayRoute?: GatewayRouteType
}

export interface StoredModelLlmCustomPricing {
  inputPerMillion?: number
  outputPerMillion?: number
}

export interface StoredModelMediaCustomPricing {
  basePrice?: number
  optionPrices?: Record<string, Record<string, number>>
}

export interface StoredModelCustomPricing {
  llm?: StoredModelLlmCustomPricing
  image?: StoredModelMediaCustomPricing
  video?: StoredModelMediaCustomPricing
  music?: StoredModelMediaCustomPricing
}

export interface StoredModel {
  modelId: string
  modelKey: string
  name: string
  type: UnifiedModelType
  provider: string
  llmProtocol?: LlmProtocolType
  llmProtocolCheckedAt?: string
  compatMediaTemplate?: OpenAICompatMediaTemplate
  compatMediaTemplateCheckedAt?: string
  compatMediaTemplateSource?: OpenAICompatMediaTemplateSource
  // Non-authoritative display field; billing always uses server pricing catalog.
  price: number
  priceMin?: number
  priceMax?: number
  priceLabel?: string
  priceInput?: number
  priceOutput?: number
  capabilities?: ModelCapabilities
  customPricing?: StoredModelCustomPricing
}

export interface PricingDisplayItem {
  min: number
  max: number
  label: string
  input?: number
  output?: number
}

export type PricingDisplayMap = Record<string, PricingDisplayItem>

export interface DefaultModelsPayload {
  analysisModel?: string
  characterModel?: string
  locationModel?: string
  storyboardModel?: string
  editModel?: string
  videoModel?: string
  audioModel?: string
  musicModel?: string
  lipSyncModel?: string
  voiceDesignModel?: string
}

export interface WorkflowConcurrencyPayload {
  analysis?: number
  image?: number
  video?: number
}

export interface ApiConfigPutBody {
  models?: unknown
  providers?: unknown
  defaultModels?: unknown
  capabilityDefaults?: unknown
  workflowConcurrency?: unknown
}

export const DEFAULT_MODEL_FIELDS: DefaultModelField[] = [
  'analysisModel',
  'characterModel',
  'locationModel',
  'storyboardModel',
  'editModel',
  'videoModel',
  'audioModel',
  'musicModel',
  'lipSyncModel',
  'voiceDesignModel',
]
export const CAPABILITY_MODEL_TYPES: readonly UnifiedModelType[] = [
  'image',
  'video',
  'llm',
  'audio',
  'music',
  'lipsync',
]
