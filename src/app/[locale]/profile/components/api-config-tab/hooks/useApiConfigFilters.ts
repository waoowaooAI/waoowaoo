'use client'

import { useMemo } from 'react'
import { DEFAULT_VOICE_DESIGN_MODEL_KEY } from '@/lib/ai-registry/api-config-catalog'
import { parseModelKeyStrict } from '@/lib/ai-registry/selection'
import type { CustomModel, Provider } from '../../api-config'
import { getProviderKey } from '../../api-config'

interface UseApiConfigFiltersParams {
  providers: Provider[]
  models: CustomModel[]
}

interface EnabledModelOption extends CustomModel {
  providerName: string
}

const DYNAMIC_PROVIDER_PREFIXES = ['gemini-compatible', 'openai-compatible']
const ALWAYS_SHOW_PROVIDERS: string[] = []
/** 完全不在 UI 中展示的 provider（既不在主列表，也不在折叠区） */
const HIDDEN_PROVIDER_KEYS = new Set(['siliconflow'])
const PROVIDER_MODEL_TYPES: Array<'llm' | 'image' | 'video' | 'audio' | 'music' | 'lipsync'> = ['llm', 'image', 'video', 'audio', 'music', 'lipsync']
const DEFAULT_VOICE_DESIGN_MODEL_ID = parseModelKeyStrict(DEFAULT_VOICE_DESIGN_MODEL_KEY)?.modelId
if (!DEFAULT_VOICE_DESIGN_MODEL_ID) {
  throw new Error('DEFAULT_VOICE_DESIGN_MODEL_KEY_INVALID')
}

const DEFAULT_AUDIO_EXCLUDED_MODEL_IDS = new Set([
  DEFAULT_VOICE_DESIGN_MODEL_ID,
])
const MODEL_PROVIDER_KEYS = [
  'ark',
  'google',
  'bailian',
  'openrouter',
  'minimax',
  'vidu',
  'fal',
  'gemini-compatible',
  'openai-compatible',
]

function isProviderModelType(type: CustomModel['type']): type is 'llm' | 'image' | 'video' | 'audio' | 'music' | 'lipsync' {
  return PROVIDER_MODEL_TYPES.includes(type as 'llm' | 'image' | 'video' | 'audio' | 'music' | 'lipsync')
}

function isDefaultModelType(type: CustomModel['type']): type is 'llm' | 'image' | 'video' | 'audio' | 'music' | 'lipsync' {
  return type === 'llm' || type === 'image' || type === 'video' || type === 'audio' || type === 'music' || type === 'lipsync'
}

function isAudioDefaultCandidate(model: CustomModel): boolean {
  if (model.type !== 'audio') return true
  return !DEFAULT_AUDIO_EXCLUDED_MODEL_IDS.has(model.modelId)
}

function hasProviderApiKey(provider: Provider | undefined): boolean {
  if (!provider) return false
  if (provider.hasApiKey === true) return true
  const apiKey = typeof provider.apiKey === 'string' ? provider.apiKey.trim() : ''
  return apiKey.length > 0
}

function shouldExposeModelForProvider(provider: Provider | undefined, model: CustomModel): boolean {
  if (!provider) return false
  return !(model.type === 'music' && getProviderKey(provider.id) === 'gemini-compatible')
}

export function useApiConfigFilters({
  providers,
  models,
}: UseApiConfigFiltersParams) {
  const modelProviderKeys = useMemo(() => {
    const keys = new Set<string>(MODEL_PROVIDER_KEYS)
    models.forEach((model) => {
      if (!isProviderModelType(model.type)) return
      keys.add(getProviderKey(model.provider))
    })
    return keys
  }, [models])

  const isPresetProvider = (providerId: string) => {
    // Custom providers are always namespaced (e.g. gemini-compatible:uuid).
    // Built-in catalog providers use plain ids without ':'.
    return !providerId.includes(':')
  }

  const modelProviders = useMemo(() => {
    return providers.filter((provider) => {
      const providerKey = getProviderKey(provider.id)
      if (HIDDEN_PROVIDER_KEYS.has(providerKey)) return false
      const isCustomProvider = !isPresetProvider(provider.id)
      const isDynamicProvider =
        DYNAMIC_PROVIDER_PREFIXES.includes(providerKey) && provider.id.includes(':')

      return (
        (isCustomProvider && modelProviderKeys.has(providerKey)) ||
        modelProviderKeys.has(providerKey) ||
        ALWAYS_SHOW_PROVIDERS.includes(providerKey) ||
        isDynamicProvider
      )
    })
  }, [modelProviderKeys, providers])

  const enabledModelsByType = useMemo(() => {
    const grouped: Record<'llm' | 'image' | 'video' | 'audio' | 'music' | 'lipsync' | 'voicedesign', EnabledModelOption[]> = {
      llm: [],
      image: [],
      video: [],
      audio: [],
      music: [],
      lipsync: [],
      voicedesign: [],
    }

    const providersById = new Map(providers.map((provider) => [provider.id, provider] as const))

    for (const model of models) {
      if (!model.enabled) continue
      if (!isDefaultModelType(model.type)) continue
      const provider = providersById.get(model.provider)
      if (!hasProviderApiKey(provider)) continue
      if (!shouldExposeModelForProvider(provider, model)) continue

      const option: EnabledModelOption = {
        ...model,
        providerName: provider?.name || model.provider,
      }

      // Voice design models (audio type but excluded from TTS)
      if (model.type === 'audio' && DEFAULT_AUDIO_EXCLUDED_MODEL_IDS.has(model.modelId)) {
        grouped.voicedesign.push(option)
        continue
      }

      // Normal audio default candidate check
      if (!isAudioDefaultCandidate(model)) continue

      grouped[model.type].push(option)
    }

    return grouped
  }, [models, providers])

  const providersById = useMemo(() => new Map(providers.map((provider) => [provider.id, provider] as const)), [providers])

  return {
    modelProviders,
    getModelsForProvider: (providerId: string) =>
      models.filter((model) => model.provider === providerId && shouldExposeModelForProvider(providersById.get(providerId), model)),
    getEnabledModelsByType: (type: 'llm' | 'image' | 'video' | 'audio' | 'music' | 'lipsync' | 'voicedesign') => enabledModelsByType[type],
  }
}
