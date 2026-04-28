import { getProviderKey } from '@/lib/ai-registry/selection'
import type {
  AiExecutionMode,
  AiOptionSchema,
  AiResolvedSelection,
  AiVariantDescriptor,
} from '@/lib/ai-registry/types'
import { resolveAiContractsForDescriptor } from '@/lib/ai-registry/model-contracts'
import type { MediaModality } from '@/lib/ai-providers/shared/option-schema'

export function describeMediaVariantBase(input: {
  modality: MediaModality
  selection: AiResolvedSelection
  executionMode: AiExecutionMode
  optionSchema: AiOptionSchema
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
    execution: {
      mode: input.executionMode,
    },
    capabilities: contracts.capabilities,
    optionSchema: input.optionSchema,
    ...(contracts.inputContracts ? { inputContracts: contracts.inputContracts } : {}),
  }
}
