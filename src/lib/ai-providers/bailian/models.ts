import type { MediaOptionSchemaConfig } from '@/lib/ai-providers/shared/media-option-schema-config'
import type { AiOptionSchema } from '@/lib/ai-registry/types'
import { booleanValidator, buildMediaOptionSchema, integerRangeValidator, type MediaModality } from '@/lib/ai-providers/shared/option-schema'

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
