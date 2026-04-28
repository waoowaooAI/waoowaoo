import { describeMediaVariantBase, type DescribeOnlyMediaAdapter } from '@/lib/ai-providers/shared/media-adapter'
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
