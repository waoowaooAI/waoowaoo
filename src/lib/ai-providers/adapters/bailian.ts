import type { DescribeOnlyMediaAdapter } from './types'
import { describeMediaVariantBase } from './shared'
import { resolveBailianOptionSchema } from '@/lib/ai-providers/bailian/models'

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
