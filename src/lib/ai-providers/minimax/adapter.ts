import { describeMediaVariantBase, type DescribeOnlyMediaAdapter } from '@/lib/ai-providers/shared/media-adapter'
import { resolveMinimaxOptionSchema } from './models'

export const minimaxMediaAdapter: DescribeOnlyMediaAdapter = {
  providerKey: 'minimax',
  describeVariant(modality, selection) {
    return describeMediaVariantBase({
      modality,
      selection,
      executionMode: modality === 'video' ? 'async' : 'sync',
      optionSchema: resolveMinimaxOptionSchema(modality, selection.modelId),
    })
  },
}
