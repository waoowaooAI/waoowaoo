import { describeMediaVariantBase } from '@/lib/ai-providers/adapters/shared'
import type { DescribeOnlyMediaAdapter } from '@/lib/ai-providers/adapters/types'
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
