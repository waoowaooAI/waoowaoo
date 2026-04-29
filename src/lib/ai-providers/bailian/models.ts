import type { MediaOptionSchemaConfig } from '@/lib/ai-providers/shared/media-option-schema-config'
import type { AiOptionSchema } from '@/lib/ai-registry/types'
import { booleanValidator, buildMediaOptionSchema, integerRangeValidator, type MediaModality } from '@/lib/ai-providers/shared/option-schema'

export type BailianOfficialModality = 'llm' | 'image' | 'video' | 'audio'

export const BAILIAN_DEFAULT_VOICE_DESIGN_MODEL_KEY = 'bailian::qwen-voice-design'

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

export const BAILIAN_API_CONFIG_CATALOG_MODELS = [
  { modelId: 'qwen3.5-plus', name: 'Qwen 3.5 Plus', type: 'llm', provider: 'bailian' },
  { modelId: 'qwen3.5-flash', name: 'Qwen 3.5 Flash', type: 'llm', provider: 'bailian' },
  { modelId: 'wan2.7-i2v', name: 'Wan2.7 I2V', type: 'video', provider: 'bailian' },
  { modelId: 'wan2.6-i2v-flash', name: 'Wan2.6 I2V Flash', type: 'video', provider: 'bailian' },
  { modelId: 'wan2.6-i2v', name: 'Wan2.6 I2V', type: 'video', provider: 'bailian' },
  { modelId: 'wan2.5-i2v-preview', name: 'Wan2.5 I2V Preview', type: 'video', provider: 'bailian' },
  { modelId: 'wan2.2-i2v-plus', name: 'Wan2.2 I2V Plus', type: 'video', provider: 'bailian' },
  { modelId: 'wan2.2-kf2v-flash', name: 'Wan2.2 KF2V Flash', type: 'video', provider: 'bailian' },
  { modelId: 'wanx2.1-kf2v-plus', name: 'WanX2.1 KF2V Plus', type: 'video', provider: 'bailian' },
  { modelId: 'qwen3-tts-vd-2026-01-26', name: 'Qwen3 TTS', type: 'audio', provider: 'bailian' },
  { modelId: 'qwen-voice-design', name: 'Qwen Voice Design', type: 'audio', provider: 'bailian' },
  { modelId: 'videoretalk', name: 'VideoRetalk Lip Sync', type: 'lipsync', provider: 'bailian' },
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
