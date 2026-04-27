import { describeMediaVariantBase } from '@/lib/ai-providers/adapters/shared'
import type { DescribeOnlyMediaAdapter } from '@/lib/ai-providers/adapters/types'
import { resolveViduOptionSchema } from './models'

export const viduMediaAdapter: DescribeOnlyMediaAdapter = {
  providerKey: 'vidu',
  describeVariant(modality, selection) {
    return describeMediaVariantBase({
      modality,
      selection,
      executionMode: modality === 'video' ? 'async' : 'sync',
      optionSchema: resolveViduOptionSchema(modality, selection.modelId),
    })
  },
}
