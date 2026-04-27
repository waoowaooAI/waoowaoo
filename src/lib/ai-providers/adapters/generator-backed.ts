import type { DescribeOnlyMediaAdapter } from './types'
import { describeMediaVariantBase } from './shared'
import { resolveFalOptionSchema } from '@/lib/ai-providers/fal/models'
import { resolveMinimaxOptionSchema } from '@/lib/ai-providers/minimax/models'
import { resolveViduOptionSchema } from '@/lib/ai-providers/vidu/models'

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
