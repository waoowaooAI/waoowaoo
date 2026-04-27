import { describeMediaVariantBase } from '@/lib/ai-providers/adapters/shared'
import type { DescribeOnlyMediaAdapter } from '@/lib/ai-providers/adapters/types'
import { buildMediaOptionSchema } from '@/lib/ai-providers/shared/option-schema'

export const openRouterMediaAdapter: DescribeOnlyMediaAdapter = {
  providerKey: 'openrouter',
  describeVariant(modality, selection) {
    return describeMediaVariantBase({
      modality,
      selection,
      executionMode: modality === 'video' ? 'async' : 'sync',
      optionSchema: buildMediaOptionSchema(modality),
    })
  },
}
