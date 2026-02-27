'use client'

import { useMemo } from 'react'
import type { CustomModel, Provider } from '../../api-config'
import { PRESET_PROVIDERS, getProviderKey } from '../../api-config'

interface UseApiConfigFiltersParams {
  providers: Provider[]
  models: CustomModel[]
}

interface EnabledModelOption extends CustomModel {
  providerName: string
}

const DYNAMIC_PROVIDER_PREFIXES = ['gemini-compatible', 'openai-compatible']
const ALWAYS_SHOW_PROVIDERS: string[] = []
const MODEL_TYPES: Array<'llm' | 'image' | 'video' | 'lipsync'> = ['llm', 'image', 'video', 'lipsync']
const MODEL_PROVIDER_KEYS = [
  'ark',
  'google',
  'openrouter',
  'minimax',
  'vidu',
  'fal',
  'gemini-compatible',
  'openai-compatible',
]
const AUDIO_PROVIDER_KEYS = ['qwen']

function isModelProviderType(type: CustomModel['type']): type is 'llm' | 'image' | 'video' | 'lipsync' {
  return MODEL_TYPES.includes(type as 'llm' | 'image' | 'video' | 'lipsync')
}

function hasProviderApiKey(provider: Provider | undefined): boolean {
  if (!provider) return false
  if (provider.hasApiKey === true) return true
  const apiKey = typeof provider.apiKey === 'string' ? provider.apiKey.trim() : ''
  return apiKey.length > 0
}

export function useApiConfigFilters({
  providers,
  models,
}: UseApiConfigFiltersParams) {
  const modelProviderKeys = useMemo(() => {
    const keys = new Set<string>(MODEL_PROVIDER_KEYS)
    models.forEach((model) => {
      if (!isModelProviderType(model.type)) return
      keys.add(getProviderKey(model.provider))
    })
    return keys
  }, [models])
  const audioProviderKeys = useMemo(() => {
    const keys = new Set<string>(AUDIO_PROVIDER_KEYS)
    models.forEach((model) => {
      if (model.type !== 'audio') return
      keys.add(getProviderKey(model.provider))
    })
    return keys
  }, [models])

  const isPresetProvider = (providerId: string) => {
    return PRESET_PROVIDERS.some(
      (provider) => provider.id === getProviderKey(providerId),
    )
  }

  const modelProviders = useMemo(() => {
    return providers.filter((provider) => {
      const providerKey = getProviderKey(provider.id)
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

  const audioProviders = useMemo(
    () =>
      providers.filter((provider) => {
        const providerKey = getProviderKey(provider.id)
        if (providerKey === 'fal') return false
        return audioProviderKeys.has(providerKey)
      }),
    [audioProviderKeys, providers],
  )

  const enabledModelsByType = useMemo(() => {
    const grouped: Record<'llm' | 'image' | 'video' | 'lipsync', EnabledModelOption[]> = {
      llm: [],
      image: [],
      video: [],
      lipsync: [],
    }

    const providersById = new Map(providers.map((provider) => [provider.id, provider] as const))

    for (const model of models) {
      if (!model.enabled) continue
      if (!isModelProviderType(model.type)) continue
      const provider = providersById.get(model.provider)
      if (!hasProviderApiKey(provider)) continue

      grouped[model.type].push({
        ...model,
        providerName: provider?.name || model.provider,
      })
    }

    return grouped
  }, [models, providers])

  return {
    modelProviders,
    audioProviders,
    getModelsForProvider: (providerId: string) =>
      models.filter((model) => model.provider === providerId),
    getEnabledModelsByType: (type: 'llm' | 'image' | 'video' | 'lipsync') => enabledModelsByType[type],
  }
}
