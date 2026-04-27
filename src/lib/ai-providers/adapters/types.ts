import type {
  AiModality,
  AiResolvedSelection,
  AiVariantDescriptor,
} from '@/lib/ai-registry/types'

export type DescribeOnlyMediaAdapter = {
  readonly providerKey: string
  describeVariant(
    modality: Extract<AiModality, 'image' | 'video' | 'audio'>,
    selection: AiResolvedSelection,
  ): AiVariantDescriptor
}
