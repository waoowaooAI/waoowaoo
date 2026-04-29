import { resolveBuiltinCapabilitiesByModelKey } from '@/lib/ai-registry/capabilities-catalog'
import type { AiUnknownObject, ModelCapabilities } from '@/lib/ai-registry/types'
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
}): { capabilities: ModelCapabilities; inputContracts?: AiUnknownObject } {
  const capabilityModelType = resolveCapabilityModelType(input.modality)
  const capabilities = resolveBuiltinCapabilitiesByModelKey(capabilityModelType, input.modelKey)

  const contracts: AiUnknownObject = {}
  const selection = input.selection

  if (input.modality === 'llm' || input.modality === 'vision') {
    const llmSelection = selection as AiResolvedLlmSelection | null | undefined
    const variantData = llmSelection?.variantData
    const llmProtocol = variantData && typeof variantData === 'object'
      ? variantData.llmProtocol
      : undefined
    if (llmProtocol === 'responses' || llmProtocol === 'chat-completions') {
      contracts.llmProtocol = llmProtocol
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
    capabilities: capabilities || {},
    ...(Object.keys(contracts).length > 0 ? { inputContracts: contracts } : {}),
  }
}
