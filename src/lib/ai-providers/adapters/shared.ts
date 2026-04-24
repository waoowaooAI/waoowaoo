import { getProviderKey } from '@/lib/api-config'
import type {
  AiExecutionMode,
  AiModelVariantDescriptor,
  AiOptionSchema,
  AiResolvedMediaSelection,
} from '@/lib/ai-registry/types'
import { resolveBuiltinCapabilitiesByModelKey } from '@/lib/model-capabilities/lookup'

function passthroughValidator() {
  return { ok: true } as const
}

function buildAllowedKeys(
  modality: 'image' | 'video' | 'audio',
): ReadonlySet<string> {
  if (modality === 'image') {
    return new Set([
      'provider',
      'modelId',
      'modelKey',
      'aspectRatio',
      'resolution',
      'outputFormat',
      'keepOriginalAspectRatio',
      'size',
    ])
  }
  if (modality === 'video') {
    return new Set([
      'provider',
      'modelId',
      'modelKey',
      'prompt',
      'duration',
      'fps',
      'resolution',
      'aspectRatio',
      'generateAudio',
      'lastFrameImageUrl',
      'serviceTier',
      'executionExpiresAfter',
      'returnLastFrame',
      'draft',
      'seed',
      'cameraFixed',
      'watermark',
    ])
  }
  return new Set([
    'provider',
    'modelId',
    'modelKey',
    'voice',
    'rate',
  ])
}

function buildOptionSchema(
  modality: 'image' | 'video' | 'audio',
): AiOptionSchema {
  const allowedKeys = buildAllowedKeys(modality)
  const validators = Object.fromEntries(
    Array.from(allowedKeys).map((key) => [key, passthroughValidator]),
  ) as Readonly<Record<string, (value: unknown) => { ok: true }>>
  return {
    allowedKeys,
    validators,
  }
}

export function describeMediaVariantBase(input: {
  modality: 'image' | 'video' | 'audio'
  selection: AiResolvedMediaSelection
  executionMode: AiExecutionMode
}): AiModelVariantDescriptor {
  const providerKey = getProviderKey(input.selection.provider).toLowerCase()
  const capabilities = resolveBuiltinCapabilitiesByModelKey(input.modality, input.selection.modelKey)
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
    capabilities: (capabilities || {}) as Record<string, unknown>,
    optionSchema: buildOptionSchema(input.modality),
  }
}
