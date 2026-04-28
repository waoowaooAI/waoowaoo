import { describeMediaVariantBase } from '@/lib/ai-providers/adapters/shared'
import type { DescribeOnlyMediaAdapter } from '@/lib/ai-providers/adapters/types'
import { resolveOpenRouterOptionSchema } from './models'

export const openRouterMediaAdapter: DescribeOnlyMediaAdapter = {
  providerKey: 'openrouter',
  describeVariant(modality, selection) {
    return describeMediaVariantBase({
      modality,
      selection,
      executionMode: modality === 'video' ? 'async' : 'sync',
      optionSchema: resolveOpenRouterOptionSchema(modality),
    })
  },
}
