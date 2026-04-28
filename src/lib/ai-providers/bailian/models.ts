import type { MediaOptionSchemaConfig } from '@/lib/ai-providers/shared/media-option-schema-config'
import type { AiOptionSchema } from '@/lib/ai-registry/types'
import { booleanValidator, buildMediaOptionSchema, integerRangeValidator, type MediaModality } from '@/lib/ai-providers/shared/option-schema'

export type BailianOfficialModality = 'llm' | 'image' | 'video' | 'audio'

const BAILIAN_OFFICIAL_MODEL_ID_SETS = {
  llm: new Set<string>([
    'qwen3.5-plus',
    'qwen3.5-flash',
  ]),
  image: new Set<string>([]),
  video: new Set<string>([
    'wan2.7-i2v',
    'wan2.6-i2v-flash',
    'wan2.6-i2v',
    'wan2.5-i2v-preview',
    'wan2.2-i2v-plus',
    'wan2.2-kf2v-flash',
    'wanx2.1-kf2v-plus',
  ]),
  audio: new Set<string>([
    'qwen3-tts-vd-2026-01-26',
  ]),
} as const satisfies Record<BailianOfficialModality, ReadonlySet<string>>

export function assertBailianOfficialModelSupported(modality: BailianOfficialModality, modelId: string): void {
  if (BAILIAN_OFFICIAL_MODEL_ID_SETS[modality].has(modelId)) return
  throw new Error(`MODEL_NOT_REGISTERED: bailian/${modality}/${modelId}`)
}

export const BAILIAN_BUILTIN_CAPABILITY_CATALOG_ENTRIES = [
  {
    modelType: 'video',
    provider: 'bailian',
    modelId: 'wan2.7-i2v',
    capabilities: { video: { generationModeOptions: ['normal', 'firstlastframe'], firstlastframe: true, supportGenerateAudio: false } },
  },
  {
    modelType: 'video',
    provider: 'bailian',
    modelId: 'wan2.6-i2v-flash',
    capabilities: { video: { generationModeOptions: ['normal'], firstlastframe: false, supportGenerateAudio: false } },
  },
  {
    modelType: 'video',
    provider: 'bailian',
    modelId: 'wan2.6-i2v',
    capabilities: { video: { generationModeOptions: ['normal'], firstlastframe: false, supportGenerateAudio: false } },
  },
  {
    modelType: 'video',
    provider: 'bailian',
    modelId: 'wan2.5-i2v-preview',
    capabilities: { video: { generationModeOptions: ['normal'], firstlastframe: false, supportGenerateAudio: false } },
  },
  {
    modelType: 'video',
    provider: 'bailian',
    modelId: 'wan2.2-i2v-plus',
    capabilities: { video: { generationModeOptions: ['normal'], firstlastframe: false, supportGenerateAudio: false } },
  },
  {
    modelType: 'video',
    provider: 'bailian',
    modelId: 'wan2.2-kf2v-flash',
    capabilities: { video: { generationModeOptions: ['firstlastframe'], firstlastframe: true, supportGenerateAudio: false } },
  },
  {
    modelType: 'video',
    provider: 'bailian',
    modelId: 'wanx2.1-kf2v-plus',
    capabilities: { video: { generationModeOptions: ['firstlastframe'], firstlastframe: true, supportGenerateAudio: false } },
  },
] as const

export const BAILIAN_BUILTIN_PRICING_CATALOG_ENTRIES = [
  {
    apiType: 'voice-design',
    provider: 'bailian',
    modelId: 'qwen-voice-design',
    pricing: { mode: 'flat', flatAmount: 0.2 },
  },
  {
    apiType: 'lip-sync',
    provider: 'bailian',
    modelId: 'videoretalk',
    pricing: { mode: 'flat', flatAmount: 0.08 },
  },
] as const

export const BAILIAN_VIDEO_OPTION_SCHEMA_CONFIG = {
  validators: {
    duration: { kind: 'integer', min: 1 },
    watermark: { kind: 'boolean' },
    promptExtend: { kind: 'boolean' },
  },
} satisfies MediaOptionSchemaConfig

export function resolveBailianOptionSchema(modality: MediaModality): AiOptionSchema {
  if (modality === 'video') {
    return buildMediaOptionSchema('video', {
      ...BAILIAN_VIDEO_OPTION_SCHEMA_CONFIG,
      validators: {
        duration: integerRangeValidator({ min: 1 }),
        watermark: booleanValidator(),
        promptExtend: booleanValidator(),
      },
    })
  }
  return buildMediaOptionSchema(modality)
}
