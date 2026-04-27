import type { DescribeOnlyMediaAdapter } from './types'
import { describeMediaVariantBase } from './shared'
import { resolveOpenAiCompatibleOptionSchema } from '@/lib/ai-providers/openai-compatible/models'

export const openAiCompatibleMediaAdapter: DescribeOnlyMediaAdapter = {
  providerKey: 'openai-compatible',
  describeVariant(modality, selection) {
    const compatTemplate = selection.variantData?.compatMediaTemplate as { mode?: 'sync' | 'async' } | undefined
    return describeMediaVariantBase({
      modality,
      selection,
      executionMode: compatTemplate?.mode === 'async' ? 'async' : 'sync',
      optionSchema: resolveOpenAiCompatibleOptionSchema(modality),
    })
  },
}
