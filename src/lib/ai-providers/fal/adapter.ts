import { describeMediaVariantBase } from '@/lib/ai-providers/adapters/shared'
import type { DescribeOnlyMediaAdapter } from '@/lib/ai-providers/adapters/types'
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
