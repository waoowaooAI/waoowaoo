import { describeMediaVariantBase, type DescribeOnlyMediaAdapter } from '@/lib/ai-providers/shared/media-adapter'
import { resolveBailianOptionSchema } from './models'

export const bailianMediaAdapter: DescribeOnlyMediaAdapter = {
  providerKey: 'bailian',
  describeVariant(modality, selection) {
    return describeMediaVariantBase({
      modality,
      selection,
      executionMode: modality === 'video' ? 'async' : 'sync',
      optionSchema: resolveBailianOptionSchema(modality),
    })
  },
}
