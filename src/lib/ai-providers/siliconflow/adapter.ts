import { describeMediaVariantBase, type DescribeOnlyMediaAdapter } from '@/lib/ai-providers/shared/media-adapter'
import { resolveSiliconFlowOptionSchema } from './models'

export const siliconFlowMediaAdapter: DescribeOnlyMediaAdapter = {
  providerKey: 'siliconflow',
  describeVariant(modality, selection) {
    return describeMediaVariantBase({
      modality,
      selection,
      executionMode: modality === 'video' ? 'async' : 'sync',
      optionSchema: resolveSiliconFlowOptionSchema(modality),
    })
  },
}
