import type { DescribeOnlyMediaAdapter } from './types'
import { describeMediaVariantBase } from './shared'
import { resolveArkOptionSchema } from '@/lib/ai-providers/ark/models'

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
      optionSchema: resolveArkOptionSchema(modality, selection.modelId),
    })
  },
}
