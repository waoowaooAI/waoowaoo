import { describeMediaVariantBase } from '@/lib/ai-providers/adapters/shared'
import type { DescribeOnlyMediaAdapter } from '@/lib/ai-providers/adapters/types'

export const arkMediaAdapter: DescribeOnlyMediaAdapter = {
  providerKey: 'ark',
  describeVariant(modality, selection) {
    const executionMode = modality === 'video'
      ? (selection.modelId.endsWith('-batch') ? 'batch' : 'async')
      : 'sync'
    return describeMediaVariantBase({
      modality,
      selection,
      executionMode,
    })
  },
}
