import { resolveBuiltinCapabilitiesByModelKey } from '@/lib/model-capabilities/lookup'
import type { AiModality, AiResolvedLlmSelection, AiResolvedSelection } from '@/lib/ai-registry/types'

function resolveCapabilityModelType(modality: AiModality): 'llm' | 'image' | 'video' | 'audio' | 'lipsync' {
  if (modality === 'vision') return 'llm'
  return modality
}

export function resolveAiContractsForDescriptor(input: {
  modality: AiModality
  modelKey: string
  providerId: string
  modelId: string
  selection?: AiResolvedSelection | AiResolvedLlmSelection | null
}): { capabilities: Record<string, unknown>; inputContracts?: Record<string, unknown> } {
  const capabilityModelType = resolveCapabilityModelType(input.modality)
  const capabilities = resolveBuiltinCapabilitiesByModelKey(capabilityModelType, input.modelKey)

  const contracts: Record<string, unknown> = {}
  const selection = input.selection

  if (input.modality === 'llm' || input.modality === 'vision') {
    const llmSelection = selection as AiResolvedLlmSelection | null | undefined
    if (llmSelection?.llmProtocol) {
      contracts.llmProtocol = llmSelection.llmProtocol
    }
  }

  if (input.modality === 'image' || input.modality === 'video' || input.modality === 'audio') {
    const mediaSelection = selection as AiResolvedSelection | null | undefined
    const variantData = mediaSelection?.variantData
    const compatMediaTemplate = variantData && typeof variantData === 'object'
      ? (variantData.compatMediaTemplate as { mode?: 'sync' | 'async' } | undefined)
      : undefined
    const mode = compatMediaTemplate?.mode
    if (mode) {
      contracts.compatMediaTemplateMode = mode
    }
  }

  return {
    capabilities: (capabilities || {}) as Record<string, unknown>,
    ...(Object.keys(contracts).length > 0 ? { inputContracts: contracts } : {}),
  }
}
