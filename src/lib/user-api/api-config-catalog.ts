import { composeModelKey, parseModelKeyStrict } from '@/lib/ai-registry/selection'
import type { ModelCapabilities, UnifiedModelType } from '@/lib/ai-registry/types'

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

export const API_CONFIG_CATALOG_MODELS: ApiConfigCatalogModel[] = [
    // 文本模型
    { modelId: 'google/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', type: 'llm', provider: 'openrouter' },
    { modelId: 'google/gemini-3-pro-preview', name: 'Gemini 3 Pro', type: 'llm', provider: 'openrouter' },
    { modelId: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash', type: 'llm', provider: 'openrouter' },
    { modelId: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', type: 'llm', provider: 'openrouter' },
    { modelId: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', type: 'llm', provider: 'openrouter' },
    { modelId: 'openai/gpt-5.4', name: 'GPT-5.4', type: 'llm', provider: 'openrouter' },
    { modelId: 'google/gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite', type: 'llm', provider: 'openrouter' },
    // Google AI Studio 文本模型
    { modelId: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', type: 'llm', provider: 'google' },
    { modelId: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', type: 'llm', provider: 'google' },
    { modelId: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash-Lite', type: 'llm', provider: 'google' },
    // 火山引擎 Doubao 文本模型
    { modelId: 'doubao-seed-1-8-251228', name: 'Doubao Seed 1.8', type: 'llm', provider: 'ark' },
    { modelId: 'doubao-seed-2-0-pro-260215', name: 'Doubao Seed 2.0 Pro', type: 'llm', provider: 'ark' },
    { modelId: 'doubao-seed-2-0-lite-260215', name: 'Doubao Seed 2.0 Lite', type: 'llm', provider: 'ark' },
    { modelId: 'doubao-seed-2-0-mini-260215', name: 'Doubao Seed 2.0 Mini', type: 'llm', provider: 'ark' },
    { modelId: 'doubao-seed-1-6-251015', name: 'Doubao Seed 1.6', type: 'llm', provider: 'ark' },
    { modelId: 'doubao-seed-1-6-lite-251015', name: 'Doubao Seed 1.6 Lite', type: 'llm', provider: 'ark' },
    // 阿里云百炼文本模型
    { modelId: 'qwen3.5-plus', name: 'Qwen 3.5 Plus', type: 'llm', provider: 'bailian' },
    { modelId: 'qwen3.5-flash', name: 'Qwen 3.5 Flash', type: 'llm', provider: 'bailian' },
    // MiniMax 官方文本模型
    { modelId: 'MiniMax-M2.5', name: 'MiniMax M2.5', type: 'llm', provider: 'minimax' },
    { modelId: 'MiniMax-M2.5-highspeed', name: 'MiniMax M2.5 Highspeed', type: 'llm', provider: 'minimax' },
    { modelId: 'MiniMax-M2.1', name: 'MiniMax M2.1', type: 'llm', provider: 'minimax' },
    { modelId: 'MiniMax-M2.1-highspeed', name: 'MiniMax M2.1 Highspeed', type: 'llm', provider: 'minimax' },
    { modelId: 'MiniMax-M2', name: 'MiniMax M2', type: 'llm', provider: 'minimax' },

    // 图像模型
    { modelId: 'banana', name: 'Banana Pro', type: 'image', provider: 'fal' },
    { modelId: 'banana-2', name: 'Banana 2', type: 'image', provider: 'fal' },
    { modelId: 'doubao-seedream-4-5-251128', name: 'Seedream 4.5', type: 'image', provider: 'ark' },
    { modelId: 'doubao-seedream-4-0-250828', name: 'Seedream 4.0', type: 'image', provider: 'ark' },
    { modelId: 'doubao-seedream-5-0-260128', name: 'Seedream 5.0 Lite', type: 'image', provider: 'ark' },
    { modelId: 'gemini-3-pro-image-preview', name: 'Banana Pro', type: 'image', provider: 'google' },
    { modelId: 'gemini-3.1-flash-image-preview', name: 'Nano Banana 2', type: 'image', provider: 'google' },
    { modelId: 'gemini-3-pro-image-preview-batch', name: 'Banana Pro (Batch)', type: 'image', provider: 'google' },
    { modelId: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image', type: 'image', provider: 'google' },
    { modelId: 'imagen-4.0-generate-001', name: 'Imagen 4', type: 'image', provider: 'google' },
    { modelId: 'imagen-4.0-ultra-generate-001', name: 'Imagen 4 Ultra', type: 'image', provider: 'google' },
    { modelId: 'imagen-4.0-fast-generate-001', name: 'Imagen 4 Fast', type: 'image', provider: 'google' },
    // 视频模型
    { modelId: 'doubao-seedance-1-0-pro-fast-251015', name: 'Seedance 1.0 Pro Fast', type: 'video', provider: 'ark' },
    { modelId: 'doubao-seedance-1-0-lite-i2v-250428', name: 'Seedance 1.0 Lite', type: 'video', provider: 'ark' },
    { modelId: 'doubao-seedance-1-5-pro-251215', name: 'Seedance 1.5 Pro', type: 'video', provider: 'ark' },
    { modelId: 'doubao-seedance-2-0-260128', name: 'Seedance 2.0', type: 'video', provider: 'ark' },
    { modelId: 'doubao-seedance-2-0-fast-260128', name: 'Seedance 2.0 Fast', type: 'video', provider: 'ark' },
    { modelId: 'doubao-seedance-1-0-pro-250528', name: 'Seedance 1.0 Pro', type: 'video', provider: 'ark' },
    // Google Veo
    { modelId: 'veo-3.1-generate-preview', name: 'Veo 3.1', type: 'video', provider: 'google' },
    { modelId: 'veo-3.1-fast-generate-preview', name: 'Veo 3.1 Fast', type: 'video', provider: 'google' },
    { modelId: 'veo-3.0-generate-001', name: 'Veo 3.0', type: 'video', provider: 'google' },
    { modelId: 'veo-3.0-fast-generate-001', name: 'Veo 3.0 Fast', type: 'video', provider: 'google' },
    { modelId: 'veo-2.0-generate-001', name: 'Veo 2.0', type: 'video', provider: 'google' },
    // 阿里云百炼图生视频模型
    { modelId: 'wan2.7-i2v', name: 'Wan2.7 I2V', type: 'video', provider: 'bailian' },
    { modelId: 'wan2.6-i2v-flash', name: 'Wan2.6 I2V Flash', type: 'video', provider: 'bailian' },
    { modelId: 'wan2.6-i2v', name: 'Wan2.6 I2V', type: 'video', provider: 'bailian' },
    { modelId: 'wan2.5-i2v-preview', name: 'Wan2.5 I2V Preview', type: 'video', provider: 'bailian' },
    { modelId: 'wan2.2-i2v-plus', name: 'Wan2.2 I2V Plus', type: 'video', provider: 'bailian' },
    { modelId: 'wan2.2-kf2v-flash', name: 'Wan2.2 KF2V Flash', type: 'video', provider: 'bailian' },
    { modelId: 'wanx2.1-kf2v-plus', name: 'WanX2.1 KF2V Plus', type: 'video', provider: 'bailian' },
    { modelId: 'fal-wan25', name: 'Wan 2.6', type: 'video', provider: 'fal' },
    { modelId: 'fal-veo31', name: 'Veo 3.1', type: 'video', provider: 'fal' },
    { modelId: 'fal-sora2', name: 'Sora 2', type: 'video', provider: 'fal' },
    { modelId: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video', name: 'Kling 2.5 Turbo Pro', type: 'video', provider: 'fal' },
    { modelId: 'fal-ai/kling-video/v3/standard/image-to-video', name: 'Kling 3 Standard', type: 'video', provider: 'fal' },
    { modelId: 'fal-ai/kling-video/v3/pro/image-to-video', name: 'Kling 3 Pro', type: 'video', provider: 'fal' },

    // 音频模型
    { modelId: 'fal-ai/index-tts-2/text-to-speech', name: 'IndexTTS 2', type: 'audio', provider: 'fal' },
    { modelId: 'qwen3-tts-vd-2026-01-26', name: 'Qwen3 TTS', type: 'audio', provider: 'bailian' },
    { modelId: 'qwen-voice-design', name: 'Qwen Voice Design', type: 'audio', provider: 'bailian' },
    // 口型同步模型
    { modelId: 'fal-ai/kling-video/lipsync/audio-to-video', name: 'Kling Lip Sync', type: 'lipsync', provider: 'fal' },
    { modelId: 'vidu-lipsync', name: 'Vidu Lip Sync', type: 'lipsync', provider: 'vidu' },
    { modelId: 'videoretalk', name: 'VideoRetalk Lip Sync', type: 'lipsync', provider: 'bailian' },

    // MiniMax 视频模型
    { modelId: 'minimax-hailuo-2.3', name: 'Hailuo 2.3', type: 'video', provider: 'minimax' },
    { modelId: 'minimax-hailuo-2.3-fast', name: 'Hailuo 2.3 Fast', type: 'video', provider: 'minimax' },
    { modelId: 'minimax-hailuo-02', name: 'Hailuo 02', type: 'video', provider: 'minimax' },
    { modelId: 't2v-01', name: 'T2V-01', type: 'video', provider: 'minimax' },
    { modelId: 't2v-01-director', name: 'T2V-01 Director', type: 'video', provider: 'minimax' },

    // Vidu 视频模型
    { modelId: 'viduq3-pro', name: 'Vidu Q3 Pro', type: 'video', provider: 'vidu' },
    { modelId: 'viduq2-pro-fast', name: 'Vidu Q2 Pro Fast', type: 'video', provider: 'vidu' },
    { modelId: 'viduq2-pro', name: 'Vidu Q2 Pro', type: 'video', provider: 'vidu' },
    { modelId: 'viduq2-turbo', name: 'Vidu Q2 Turbo', type: 'video', provider: 'vidu' },
    { modelId: 'viduq1', name: 'Vidu Q1', type: 'video', provider: 'vidu' },
    { modelId: 'viduq1-classic', name: 'Vidu Q1 Classic', type: 'video', provider: 'vidu' },
    { modelId: 'vidu2.0', name: 'Vidu 2.0', type: 'video', provider: 'vidu' },
]

export const API_CONFIG_CATALOG_PROVIDERS: ApiConfigCatalogProvider[] = [
    { id: 'ark', name: 'Volcengine Ark' },
    { id: 'google', name: 'Google AI Studio' },
    { id: 'bailian', name: 'Alibaba Bailian' },
    { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
    { id: 'minimax', name: 'MiniMax Hailuo', baseUrl: 'https://api.minimaxi.com/v1' },
    { id: 'vidu', name: 'Vidu' },
    { id: 'fal', name: 'FAL' },
]


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

const ZH_PROVIDER_NAME_MAP: Record<string, string> = {
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
  return API_CONFIG_CATALOG_MODELS
    .filter((model) => model.provider === 'google' && !model.modelId.endsWith('-batch'))
    .map((model) => ({ ...model, provider: providerId }))
}

export function buildApiConfigServerCatalog(input?: {
  resolveCapabilities?: (model: ApiConfigCatalogModel) => ModelCapabilities | undefined
}): ApiConfigServerCatalog {
  return {
    providers: API_CONFIG_CATALOG_PROVIDERS.map((provider) => ({ ...provider })),
    models: API_CONFIG_CATALOG_MODELS.map((model) => ({
      ...model,
      ...(input?.resolveCapabilities
        ? { capabilities: input.resolveCapabilities(model) }
        : model.capabilities
          ? { capabilities: JSON.parse(JSON.stringify(model.capabilities)) as ModelCapabilities }
          : {}),
    })),
  }
}
