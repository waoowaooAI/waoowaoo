import { getProviderKey } from '@/lib/ai-registry/selection'
import type { AiExecutionMode, AiResolvedLlmSelection, AiVariantDescriptor } from '@/lib/ai-registry/types'
import { resolveAiContractsForDescriptor } from '@/lib/ai-registry/model-contracts'
import { buildLlmOptionSchema } from '@/lib/ai-exec/llm-option-schema'

export function describeLlmVariantBase(input: {
  modality: 'llm' | 'vision'
  selection: AiResolvedLlmSelection
  executionMode: AiExecutionMode
}): AiVariantDescriptor {
  const providerKey = getProviderKey(input.selection.provider).toLowerCase()
  const contracts = resolveAiContractsForDescriptor({
    modality: input.modality,
    modelKey: input.selection.modelKey,
    providerId: input.selection.provider,
    modelId: input.selection.modelId,
    selection: input.selection,
  })
  return {
    modelKey: input.selection.modelKey,
    providerKey,
    providerId: input.selection.provider,
    modelId: input.selection.modelId,
    modality: input.modality,
    display: {
      name: input.selection.modelId,
      sourceLabel: providerKey,
      label: `${input.selection.modelId} (${providerKey})`,
    },
    execution: { mode: input.executionMode },
    capabilities: contracts.capabilities,
    optionSchema: buildLlmOptionSchema(),
    ...(contracts.inputContracts ? { inputContracts: contracts.inputContracts } : {}),
  }
}
