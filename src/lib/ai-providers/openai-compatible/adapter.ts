import { describeMediaVariantBase } from '@/lib/ai-providers/adapters/shared'
import type { DescribeOnlyMediaAdapter } from '@/lib/ai-providers/adapters/types'

export const openAiCompatibleMediaAdapter: DescribeOnlyMediaAdapter = {
  providerKey: 'openai-compatible',
  describeVariant(modality, selection) {
    const compatTemplate = selection.variantData?.compatMediaTemplate as { mode?: 'sync' | 'async' } | undefined
    return describeMediaVariantBase({
      modality,
      selection,
      executionMode: compatTemplate?.mode === 'async' ? 'async' : 'sync',
    })
  },
}
