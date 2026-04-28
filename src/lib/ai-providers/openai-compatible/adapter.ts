import { describeMediaVariantBase, type DescribeOnlyMediaAdapter } from '@/lib/ai-providers/shared/media-adapter'
import { resolveOpenAiCompatibleOptionSchema } from './models'

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
