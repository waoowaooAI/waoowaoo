import { getProviderKey } from '@/lib/api-config'
import type {
  AiExecutionMode,
  AiModelVariantDescriptor,
  AiResolvedMediaSelection,
} from '@/lib/ai-registry/types'
import { resolveAiContractsForDescriptor } from '@/lib/ai-registry/model-contracts'
import {
  buildMediaOptionSchema,
  buildProviderSchemaOverride,
  type MediaModality,
} from './media-option-schema'

export function describeMediaVariantBase(input: {
  modality: MediaModality
  selection: AiResolvedMediaSelection
  executionMode: AiExecutionMode
}): AiModelVariantDescriptor {
  const providerKey = getProviderKey(input.selection.provider).toLowerCase()
  const contracts = resolveAiContractsForDescriptor({
    modality: input.modality,
    modelKey: input.selection.modelKey,
    providerId: input.selection.provider,
    modelId: input.selection.modelId,
    selection: input.selection,
  })
  const schemaOverride = buildProviderSchemaOverride({
    modality: input.modality,
    providerKey,
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
    optionSchema: buildMediaOptionSchema(input.modality, schemaOverride),
    ...(contracts.inputContracts ? { inputContracts: contracts.inputContracts } : {}),
  }
}
