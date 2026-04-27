import { describeMediaVariantBase } from '@/lib/ai-providers/adapters/shared'
import type { DescribeOnlyMediaAdapter } from '@/lib/ai-providers/adapters/types'
import { buildMediaOptionSchema } from '@/lib/ai-providers/shared/option-schema'

export const googleMediaAdapter: DescribeOnlyMediaAdapter = {
  providerKey: 'google',
  describeVariant(modality, selection) {
    const executionMode = modality === 'image' && selection.modelId === 'gemini-3-pro-image-preview-batch'
      ? 'batch'
      : modality === 'video'
        ? 'async'
        : 'sync'
    return describeMediaVariantBase({
      modality,
      selection,
      executionMode,
      optionSchema: buildMediaOptionSchema(modality),
    })
  },
}

export const geminiCompatibleMediaAdapter: DescribeOnlyMediaAdapter = {
  providerKey: 'gemini-compatible',
  describeVariant(modality, selection) {
    return describeMediaVariantBase({
      modality,
      selection,
      executionMode: modality === 'video' ? 'async' : 'sync',
      optionSchema: buildMediaOptionSchema(modality),
    })
  },
}
