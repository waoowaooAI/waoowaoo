type ProviderApiMode = 'gemini-sdk' | 'openai-official' | undefined

function normalizeModelId(modelId: string): string {
  return modelId.trim().toLowerCase()
}

export function isLikelyOpenAIReasoningModel(modelId: string): boolean {
  const normalized = normalizeModelId(modelId)
  if (!normalized) return false

  return normalized.startsWith('o1')
    || normalized.startsWith('o3')
    || normalized.startsWith('o4')
    || normalized.startsWith('gpt-5')
}

export function shouldUseOpenAIReasoningProviderOptions(input: {
  providerKey: string
  providerApiMode?: ProviderApiMode
  modelId: string
}): boolean {
  if (!isLikelyOpenAIReasoningModel(input.modelId)) return false

  const normalizedProviderKey = input.providerKey.trim().toLowerCase()
  if (normalizedProviderKey === 'openai') return true

  if (normalizedProviderKey === 'openai-compatible' && input.providerApiMode === 'openai-official') {
    return true
  }

  return false
}
