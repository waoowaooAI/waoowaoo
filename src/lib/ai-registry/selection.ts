export interface ParsedModelKey {
  provider: string
  modelId: string
  modelKey: string
}

export function composeModelKey(provider: string, modelId: string): string {
  const providerValue = provider.trim()
  const modelValue = modelId.trim()
  if (!providerValue || !modelValue) return ''
  return `${providerValue}::${modelValue}`
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

