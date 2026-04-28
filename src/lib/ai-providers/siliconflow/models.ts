import type { AiOptionSchema } from '@/lib/ai-registry/types'
import { buildMediaOptionSchema, type MediaModality } from '@/lib/ai-providers/shared/option-schema'

export const SILICONFLOW_BUILTIN_CAPABILITY_CATALOG_ENTRIES: readonly unknown[] = [] as const
export const SILICONFLOW_BUILTIN_PRICING_CATALOG_ENTRIES: readonly unknown[] = [] as const

export function resolveSiliconFlowOptionSchema(modality: MediaModality): AiOptionSchema {
  return buildMediaOptionSchema(modality)
}
