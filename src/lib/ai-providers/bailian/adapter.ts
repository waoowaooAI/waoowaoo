import { describeMediaVariantBase } from '@/lib/ai-providers/adapters/shared'
import type { DescribeOnlyMediaAdapter } from '@/lib/ai-providers/adapters/types'
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
