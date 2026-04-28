import { describeMediaVariantBase, type DescribeOnlyMediaAdapter } from '@/lib/ai-providers/shared/media-adapter'
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
