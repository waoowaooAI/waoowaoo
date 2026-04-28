/**
 * API 配置类型定义和预设常量
 */
import {
    type CapabilitySelections,
    type ModelCapabilities,
    type UnifiedModelType,
} from '@/lib/ai-registry/types'
import { composeModelKey, parseModelKeyStrict } from '@/lib/ai-registry/selection'
import type {
    OpenAICompatMediaTemplate,
    OpenAICompatMediaTemplateSource,
} from '@/lib/ai-providers/openai-compatible/user-template'

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

// 统一提供商接口
export interface Provider {
    id: string
    name: string
    baseUrl?: string
    apiKey?: string
    hasApiKey?: boolean
    hidden?: boolean
    apiMode?: 'gemini-sdk' | 'openai-official'
    gatewayRoute?: 'official' | 'openai-compat'
}

export interface LlmCustomPricing {
    inputPerMillion?: number
    outputPerMillion?: number
}

export interface MediaCustomPricing {
    basePrice?: number
    optionPrices?: Record<string, Record<string, number>>
}

// 用户自定义定价 V2（能力参数可定价）
export interface CustomModelPricing {
    llm?: LlmCustomPricing
    image?: MediaCustomPricing
    video?: MediaCustomPricing
}

// 模型接口
export interface CustomModel {
    modelId: string       // 唯一标识符（如 anthropic/claude-sonnet-4.5）
    modelKey: string      // 唯一主键（provider::modelId）
    name: string          // 显示名称
    type: UnifiedModelType
    provider: string
    llmProtocol?: 'responses' | 'chat-completions'
    llmProtocolCheckedAt?: string
    compatMediaTemplate?: OpenAICompatMediaTemplate
    compatMediaTemplateCheckedAt?: string
    compatMediaTemplateSource?: OpenAICompatMediaTemplateSource
    price: number
    priceMin?: number
    priceMax?: number
    priceLabel?: string
    priceInput?: number
    priceOutput?: number
    enabled: boolean
    capabilities?: ModelCapabilities
    customPricing?: CustomModelPricing
}

export interface PricingDisplayItem {
    min: number
    max: number
    label: string
    input?: number
    output?: number
}

export type PricingDisplayMap = Record<string, PricingDisplayItem>

// API 配置响应
export interface ApiConfig {
    models: CustomModel[]
    providers: Provider[]
    catalog?: ApiConfigServerCatalog
    defaultModels?: {
        analysisModel?: string
        characterModel?: string
        locationModel?: string
        storyboardModel?: string
        editModel?: string
        videoModel?: string
        audioModel?: string
        lipSyncModel?: string
        voiceDesignModel?: string
    }
    capabilityDefaults?: CapabilitySelections
    workflowConcurrency?: {
        analysis: number
        image: number
        video: number
    }
    pricingDisplay?: PricingDisplayMap
}

export const API_CONFIG_PRESET_COMING_SOON_MODEL_KEYS = new Set<string>([])

export function getProviderKey(providerId?: string): string {
    if (!providerId) return ''
    const colonIndex = providerId.indexOf(':')
    return colonIndex === -1 ? providerId : providerId.slice(0, colonIndex)
}

export function encodeModelKey(provider: string, modelId: string): string {
    const modelKey = composeModelKey(provider, modelId)
    if (!modelKey) {
        throw new Error(`MODEL_KEY_INVALID: ${provider}::${modelId}`)
    }
    return modelKey
}

export function parseModelKey(key: string | undefined | null): { provider: string; modelId: string } | null {
    const parsed = parseModelKeyStrict(key)
    if (!parsed) return null
    return { provider: parsed.provider, modelId: parsed.modelId }
}

export function matchesModelKey(key: string | undefined | null, provider: string, modelId: string): boolean {
    const parsed = parseModelKeyStrict(key)
    if (!parsed) return false
    return parsed.provider === provider && parsed.modelId === modelId
}

export function isPresetComingSoonModel(provider: string, modelId: string): boolean {
    return API_CONFIG_PRESET_COMING_SOON_MODEL_KEYS.has(encodeModelKey(provider, modelId))
}

export function isPresetComingSoonModelKey(modelKey: string): boolean {
    return API_CONFIG_PRESET_COMING_SOON_MODEL_KEYS.has(modelKey)
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

export function resolvePresetProviderName(providerId: string, fallbackName: string, locale?: string): string {
    if (!isZhLocale(locale)) return fallbackName
    return ZH_PROVIDER_NAME_MAP[providerId] ?? fallbackName
}

export function getProviderDisplayName(providerId?: string, locale?: string): string {
    if (!providerId) return ''
    const providerKey = getProviderKey(providerId)
    if (!isZhLocale(locale)) return providerKey || providerId
    return ZH_PROVIDER_NAME_MAP[providerKey] ?? (providerKey || providerId)
}

// 教程步骤接口
export interface TutorialStep {
    text: string           // 步骤描述 (i18n key)
    url?: string           // 可选的链接地址
}

// 厂商教程接口
export interface ProviderTutorial {
    providerId: string
    steps: TutorialStep[]
}

// 厂商开通教程配置
// 注意: text 字段使用 i18n key, 翻译在 apiConfig.tutorials 下
export const PROVIDER_TUTORIALS: ProviderTutorial[] = [
    {
        providerId: 'ark',
        steps: [
            {
                text: 'ark_step1',
                url: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey?apikey=%7B%7D'
            },
            {
                text: 'ark_step2',
                url: 'https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement?LLM=%7B%7D&advancedActiveKey=model'
            }
        ]
    },
    {
        providerId: 'openrouter',
        steps: [
            {
                text: 'openrouter_step1',
                url: 'https://openrouter.ai/settings/keys'
            }
        ]
    },
    {
        providerId: 'fal',
        steps: [
            {
                text: 'fal_step1',
                url: 'https://fal.ai/dashboard/keys'
            }
        ]
    },
    {
        providerId: 'google',
        steps: [
            {
                text: 'google_step1',
                url: 'https://aistudio.google.com/api-keys'
            }
        ]
    },
    {
        providerId: 'minimax',
        steps: [
            {
                text: 'minimax_step1',
                url: 'https://platform.minimaxi.com/user-center/basic-information/interface-key'
            }
        ]
    },
    {
        providerId: 'vidu',
        steps: [
            {
                text: 'vidu_step1',
                url: 'https://platform.vidu.cn/api-keys'
            }
        ]
    },
    {
        providerId: 'gemini-compatible',
        steps: [
            {
                text: 'gemini_compatible_step1'
            }
        ]
    },
    {
        providerId: 'openai-compatible',
        steps: [
            {
                text: 'openai_compatible_step1'
            }
        ]
    },
    {
        providerId: 'bailian',
        steps: [
            {
                text: 'bailian_step1',
                url: 'https://bailian.console.aliyun.com/cn-beijing/?tab=model#/api-key'
            }
        ]
    },
    {
        providerId: 'siliconflow',
        steps: [
            {
                text: 'siliconflow_step1',
                url: 'https://cloud.siliconflow.cn/account/ak'
            }
        ]
    },
]

/**
 * 根据厂商ID获取教程配置
 * @param providerId - 厂商ID
 * @returns 教程配置，如果不存在则返回 undefined
 */
export function getProviderTutorial(providerId: string): ProviderTutorial | undefined {
    const providerKey = getProviderKey(providerId)
    return PROVIDER_TUTORIALS.find(t => t.providerId === providerKey)
}

/**
 * 获取 Google 官方模型列表的克隆副本，provider 替换为指定 ID。
 * 用于 gemini-compatible 新增时自动预设模型。
 * 排除 batch 模型（Google 特有的异步批量处理）。
 */
export { getGoogleCompatibleApiConfigPresetModels as getGoogleCompatiblePresetModels } from '@/lib/ai-registry/api-config-catalog'
