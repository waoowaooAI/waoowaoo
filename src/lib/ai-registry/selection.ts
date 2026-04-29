export interface ParsedModelKey {
  provider: string
  modelId: string
  modelKey: string
}

export interface ResolvedModelSelectionKey extends ParsedModelKey {
  providerKey: string
}

export function composeModelKey(provider: string, modelId: string): string {
  const providerValue = provider.trim()
  const modelValue = modelId.trim()
  if (!providerValue || !modelValue) return ''
  return `${providerValue}::${modelValue}`
}

/**
 * 提取提供商主键（用于多实例场景，如 gemini-compatible:uuid）
 */
export function getProviderKey(providerId?: string): string {
  if (!providerId) return ''
  const colonIndex = providerId.indexOf(':')
  return colonIndex === -1 ? providerId : providerId.slice(0, colonIndex)
}

export function parseModelKey(key: string | null | undefined): ParsedModelKey | null {
  return parseModelKeyStrict(key)
}

export function parseModelKeyStrict(key: string | null | undefined): ParsedModelKey | null {
  if (!key || typeof key !== 'string') return null
  const raw = key.trim()
  if (!raw) return null
  const markerIndex = raw.indexOf('::')
  if (markerIndex === -1) return null
  const provider = raw.slice(0, markerIndex).trim()
  const modelId = raw.slice(markerIndex + 2).trim()
  if (!provider || !modelId) return null
  return {
    provider,
    modelId,
    modelKey: `${provider}::${modelId}`,
  }
}

export function isModelKey(value: string | null | undefined): boolean {
  return !!parseModelKeyStrict(value)
}

export function resolveSelection(modelKey: string | null | undefined): ResolvedModelSelectionKey {
  const parsed = parseModelKeyStrict(modelKey)
  if (!parsed) {
    throw new Error('MODEL_KEY_INVALID: modelKey must be provider::modelId')
  }
  const providerKey = getProviderKey(parsed.provider).toLowerCase()
  if (!providerKey) {
    throw new Error('MODEL_KEY_INVALID: provider is empty')
  }
  return {
    ...parsed,
    providerKey,
  }
}
