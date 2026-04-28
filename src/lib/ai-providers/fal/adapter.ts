import { describeMediaVariantBase, type DescribeOnlyMediaAdapter } from '@/lib/ai-providers/shared/media-adapter'
import { resolveFalOptionSchema } from './models'

export const falMediaAdapter: DescribeOnlyMediaAdapter = {
  providerKey: 'fal',
  describeVariant(modality, selection) {
    return describeMediaVariantBase({
      modality,
      selection,
      executionMode: modality === 'video' ? 'async' : 'sync',
      optionSchema: resolveFalOptionSchema(modality, selection.modelId),
    })
  },
}
