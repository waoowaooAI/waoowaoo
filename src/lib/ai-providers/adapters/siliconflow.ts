import type { DescribeOnlyMediaAdapter } from './types'
import { describeMediaVariantBase } from './shared'
import { buildMediaOptionSchema } from '@/lib/ai-providers/shared/option-schema'

export const siliconFlowMediaAdapter: DescribeOnlyMediaAdapter = {
  providerKey: 'siliconflow',
  describeVariant(modality, selection) {
    return describeMediaVariantBase({
      modality,
      selection,
      executionMode: modality === 'video' ? 'async' : 'sync',
      optionSchema: buildMediaOptionSchema(modality),
    })
  },
}
