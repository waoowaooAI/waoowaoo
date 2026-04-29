import type { AiOptionSchema } from '@/lib/ai-registry/types'
import { buildMediaOptionSchema, type MediaModality } from '@/lib/ai-providers/shared/option-schema'

export const SILICONFLOW_BUILTIN_CAPABILITY_CATALOG_ENTRIES: readonly unknown[] = [] as const
export const SILICONFLOW_BUILTIN_PRICING_CATALOG_ENTRIES: readonly unknown[] = [] as const

export type SiliconFlowOfficialModality = 'llm' | 'image' | 'video' | 'audio'

const SILICONFLOW_OFFICIAL_MODEL_ID_SETS = {
  llm: new Set<string>([]),
  image: new Set<string>([]),
  video: new Set<string>([]),
  audio: new Set<string>([]),
} as const satisfies Record<SiliconFlowOfficialModality, ReadonlySet<string>>

export function assertSiliconFlowOfficialModelSupported(modality: SiliconFlowOfficialModality, modelId: string): void {
  if (SILICONFLOW_OFFICIAL_MODEL_ID_SETS[modality].has(modelId)) return
  throw new Error(`MODEL_NOT_REGISTERED: siliconflow/${modality}/${modelId}`)
}

export function resolveSiliconFlowOptionSchema(modality: MediaModality): AiOptionSchema {
  return buildMediaOptionSchema(modality)
}
