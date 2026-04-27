import type { MediaOptionSchemaConfig } from '@/lib/ai-providers/shared/media-option-schema-config'

export const VIDU_VIDEO_MODES = ['normal', 'firstlastframe'] as const
export const VIDU_STANDARD_RATIOS = new Set(['16:9', '9:16', '1:1'])
export const VIDU_Q2_EXTRA_RATIOS = new Set(['4:3', '3:4', '21:9', '2:3', '3:2', 'auto'])
export const VIDU_AUDIO_TYPES = new Set(['all', 'speech_only', 'sound_effect_only'])
export const VIDU_MOVEMENT_AMPLITUDES = new Set(['auto', 'small', 'medium', 'large'])
export const VIDU_RATIO_PATTERN = /^(\d{1,4}):(\d{1,4})$/
export const VIDU_MAX_PAYLOAD_LENGTH = 1048576
export const VIDU_VIDEO_OPTION_ALLOWED_KEYS = [
  'aspect_ratio', 'generationMode', 'audio', 'audioType', 'audio_type',
  'movementAmplitude', 'movement_amplitude', 'bgm', 'isRec', 'is_rec',
  'voiceId', 'voice_id', 'payload', 'offPeak', 'off_peak', 'wmPosition',
  'wm_position', 'wmUrl', 'wm_url', 'metaData', 'meta_data', 'callbackUrl', 'callback_url',
] as const

export const VIDU_BUILTIN_CAPABILITY_CATALOG_ENTRIES = [
  {
    modelType: 'video',
    provider: 'vidu',
    modelId: 'viduq3-pro',
    capabilities: {
      video: {
        generationModeOptions: ['normal', 'firstlastframe'],
        generateAudioOptions: [false, true],
        durationOptions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
        resolutionOptions: ['540p', '720p', '1080p'],
        firstlastframe: true,
        supportGenerateAudio: true,
      },
    },
  },
  {
    modelType: 'video',
    provider: 'vidu',
    modelId: 'viduq2-pro-fast',
    capabilities: {
      video: {
        generationModeOptions: ['normal', 'firstlastframe'],
        generateAudioOptions: [false, true],
        durationOptions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        resolutionOptions: ['720p', '1080p'],
        firstlastframe: true,
        supportGenerateAudio: true,
      },
    },
  },
  {
    modelType: 'video',
    provider: 'vidu',
    modelId: 'viduq2-pro',
    capabilities: {
      video: {
        generationModeOptions: ['normal', 'firstlastframe'],
        generateAudioOptions: [false, true],
        durationOptions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        resolutionOptions: ['540p', '720p', '1080p'],
        firstlastframe: true,
        supportGenerateAudio: true,
      },
    },
  },
  {
    modelType: 'video',
    provider: 'vidu',
    modelId: 'viduq2-turbo',
    capabilities: {
      video: {
        generationModeOptions: ['normal', 'firstlastframe'],
        generateAudioOptions: [false, true],
        durationOptions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        resolutionOptions: ['540p', '720p', '1080p'],
        firstlastframe: true,
        supportGenerateAudio: true,
      },
    },
  },
  {
    modelType: 'video',
    provider: 'vidu',
    modelId: 'viduq1',
    capabilities: {
      video: {
        generationModeOptions: ['normal', 'firstlastframe'],
        durationOptions: [5],
        resolutionOptions: ['1080p'],
        firstlastframe: true,
        supportGenerateAudio: false,
      },
    },
  },
  {
    modelType: 'video',
    provider: 'vidu',
    modelId: 'viduq1-classic',
    capabilities: {
      video: {
        generationModeOptions: ['normal', 'firstlastframe'],
        durationOptions: [5],
        resolutionOptions: ['1080p'],
        firstlastframe: true,
        supportGenerateAudio: false,
      },
    },
  },
  {
    modelType: 'video',
    provider: 'vidu',
    modelId: 'vidu2.0',
    capabilities: {
      video: {
        generationModeOptions: ['normal', 'firstlastframe'],
        durationOptions: [4, 8],
        resolutionOptions: ['360p', '720p', '1080p'],
        firstlastframe: true,
        supportGenerateAudio: false,
      },
    },
  },
] as const

function range(start: number, end: number): readonly number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

export type ViduModeSpec = {
  durationOptions: readonly number[]
  resolutionByDuration: Readonly<Record<number, readonly string[]>>
}

export type ViduSpec = {
  aspectRatioProfile: 'standard' | 'q2-flex'
  supportsFirstLastFrame: boolean
  supportsGenerateAudio: boolean
  normal: ViduModeSpec
  firstLast?: ViduModeSpec
}

function uniformViduSpec(durations: readonly number[], resolutions: readonly string[]): ViduModeSpec {
  return {
    durationOptions: durations,
    resolutionByDuration: Object.fromEntries(durations.map((duration) => [duration, resolutions])),
  }
}

const Q3_DURATIONS = range(1, 16)
const Q2_NORMAL_DURATIONS = range(1, 10)
const Q2_FIRSTLAST_DURATIONS = range(1, 8)
const VIDU_20_MODE: ViduModeSpec = {
  durationOptions: [4, 8],
  resolutionByDuration: { 4: ['360p', '720p', '1080p'], 8: ['720p'] },
}

export const VIDU_VIDEO_SPECS: Record<string, ViduSpec> = {
  'viduq3-pro': {
    aspectRatioProfile: 'standard', supportsFirstLastFrame: true, supportsGenerateAudio: true,
    normal: uniformViduSpec(Q3_DURATIONS, ['540p', '720p', '1080p']),
    firstLast: uniformViduSpec(Q3_DURATIONS, ['540p', '720p', '1080p']),
  },
  'viduq2-pro-fast': {
    aspectRatioProfile: 'q2-flex', supportsFirstLastFrame: true, supportsGenerateAudio: true,
    normal: uniformViduSpec(Q2_NORMAL_DURATIONS, ['720p', '1080p']),
    firstLast: uniformViduSpec(Q2_FIRSTLAST_DURATIONS, ['720p', '1080p']),
  },
  'viduq2-pro': {
    aspectRatioProfile: 'q2-flex', supportsFirstLastFrame: true, supportsGenerateAudio: true,
    normal: uniformViduSpec(Q2_NORMAL_DURATIONS, ['540p', '720p', '1080p']),
    firstLast: uniformViduSpec(Q2_FIRSTLAST_DURATIONS, ['540p', '720p', '1080p']),
  },
  'viduq2-turbo': {
    aspectRatioProfile: 'q2-flex', supportsFirstLastFrame: true, supportsGenerateAudio: true,
    normal: uniformViduSpec(Q2_NORMAL_DURATIONS, ['540p', '720p', '1080p']),
    firstLast: uniformViduSpec(Q2_FIRSTLAST_DURATIONS, ['540p', '720p', '1080p']),
  },
  viduq1: {
    aspectRatioProfile: 'standard', supportsFirstLastFrame: true, supportsGenerateAudio: false,
    normal: uniformViduSpec([5], ['1080p']), firstLast: uniformViduSpec([5], ['1080p']),
  },
  'viduq1-classic': {
    aspectRatioProfile: 'standard', supportsFirstLastFrame: true, supportsGenerateAudio: false,
    normal: uniformViduSpec([5], ['1080p']), firstLast: uniformViduSpec([5], ['1080p']),
  },
  'vidu2.0': {
    aspectRatioProfile: 'standard', supportsFirstLastFrame: true, supportsGenerateAudio: false,
    normal: VIDU_20_MODE, firstLast: VIDU_20_MODE,
  },
}

function buildRangeAmounts(count: number, factor: number): number[] {
  return Array.from({ length: count }, (_, index) => Number(((index + 1) * factor).toFixed(5)))
}

function buildViduAudioTiers(input: {
  mode: 'normal' | 'firstlastframe'
  resolution: string
  durations: readonly number[]
  amounts: readonly number[]
  audioDelta: number
}) {
  return input.durations.flatMap((duration, index) => {
    const amount = input.amounts[index]
    return [
      {
        when: { generationMode: input.mode, resolution: input.resolution, duration, generateAudio: false },
        amount,
      },
      {
        when: { generationMode: input.mode, resolution: input.resolution, duration, generateAudio: true },
        amount: Number((amount + input.audioDelta).toFixed(5)),
      },
    ]
  })
}

function buildViduSilentTiers(input: {
  mode: 'normal' | 'firstlastframe'
  resolution: string
  durations: readonly number[]
  amounts: readonly number[]
}) {
  return input.durations.map((duration, index) => ({
    when: { generationMode: input.mode, resolution: input.resolution, duration },
    amount: input.amounts[index],
  }))
}

const VIDU_Q3_DURATIONS = Array.from({ length: 16 }, (_, index) => index + 1)
const VIDU_Q2_NORMAL_DURATIONS = Array.from({ length: 10 }, (_, index) => index + 1)
const VIDU_Q2_FIRSTLAST_DURATIONS = Array.from({ length: 8 }, (_, index) => index + 1)
const VIDU_Q3_RESOLUTION_FACTORS = {
  '540p': 0.4375,
  '720p': 0.9375,
  '1080p': 1,
} as const
const VIDU_Q2_AUDIO_DELTA = 0.46875
const VIDU_Q2_FAST_720 = [0.25, 0.3125, 0.375, 0.4375, 0.5, 0.5625, 0.625, 0.6875, 0.75, 0.8125] as const
const VIDU_Q2_FAST_1080 = [0.5, 0.625, 0.75, 0.875, 1, 1.125, 1.25, 1.375, 1.5, 1.625] as const
const VIDU_Q2_PRO_540 = [0.25, 0.3125, 0.46875, 0.625, 0.78125, 0.9375, 1.09375, 1.25, 1.40625, 1.5625] as const
const VIDU_Q2_PRO_720 = [0.46875, 0.78125, 1.09375, 1.40625, 1.71875, 2.03125, 2.34375, 2.65625, 2.96875, 3.28125] as const
const VIDU_Q2_PRO_1080 = [1.71875, 2.1875, 2.65625, 3.125, 3.59375, 4.0625, 4.53125, 5, 5.46875, 5.9375] as const
const VIDU_Q2_TURBO_540 = [0.1875, 0.25, 0.3125, 0.375, 0.4375, 0.5, 0.5625, 0.625, 0.6875, 0.75] as const
const VIDU_Q2_TURBO_720 = [0.25, 0.3125, 0.625, 0.9375, 1.25, 1.5625, 1.875, 2.1875, 2.5, 2.8125] as const
const VIDU_Q2_TURBO_1080 = [1.09375, 1.40625, 1.71875, 2.03125, 2.34375, 2.65625, 2.96875, 3.28125, 3.59375, 3.90625] as const

export const VIDU_BUILTIN_PRICING_CATALOG_ENTRIES = [
  {
    apiType: 'video',
    provider: 'vidu',
    modelId: 'viduq3-pro',
    pricing: {
      mode: 'capability',
      tiers: [
        ...buildViduAudioTiers({ mode: 'normal', resolution: '540p', durations: VIDU_Q3_DURATIONS, amounts: buildRangeAmounts(16, VIDU_Q3_RESOLUTION_FACTORS['540p']), audioDelta: 0 }),
        ...buildViduAudioTiers({ mode: 'normal', resolution: '720p', durations: VIDU_Q3_DURATIONS, amounts: buildRangeAmounts(16, VIDU_Q3_RESOLUTION_FACTORS['720p']), audioDelta: 0 }),
        ...buildViduAudioTiers({ mode: 'normal', resolution: '1080p', durations: VIDU_Q3_DURATIONS, amounts: buildRangeAmounts(16, VIDU_Q3_RESOLUTION_FACTORS['1080p']), audioDelta: 0 }),
        ...buildViduAudioTiers({ mode: 'firstlastframe', resolution: '540p', durations: VIDU_Q3_DURATIONS, amounts: buildRangeAmounts(16, VIDU_Q3_RESOLUTION_FACTORS['540p']), audioDelta: 0 }),
        ...buildViduAudioTiers({ mode: 'firstlastframe', resolution: '720p', durations: VIDU_Q3_DURATIONS, amounts: buildRangeAmounts(16, VIDU_Q3_RESOLUTION_FACTORS['720p']), audioDelta: 0 }),
        ...buildViduAudioTiers({ mode: 'firstlastframe', resolution: '1080p', durations: VIDU_Q3_DURATIONS, amounts: buildRangeAmounts(16, VIDU_Q3_RESOLUTION_FACTORS['1080p']), audioDelta: 0 }),
      ],
    },
  },
  {
    apiType: 'video',
    provider: 'vidu',
    modelId: 'viduq2-pro-fast',
    pricing: {
      mode: 'capability',
      tiers: [
        ...buildViduAudioTiers({ mode: 'normal', resolution: '720p', durations: VIDU_Q2_NORMAL_DURATIONS, amounts: VIDU_Q2_FAST_720, audioDelta: VIDU_Q2_AUDIO_DELTA }),
        ...buildViduAudioTiers({ mode: 'normal', resolution: '1080p', durations: VIDU_Q2_NORMAL_DURATIONS, amounts: VIDU_Q2_FAST_1080, audioDelta: VIDU_Q2_AUDIO_DELTA }),
        ...buildViduAudioTiers({ mode: 'firstlastframe', resolution: '720p', durations: VIDU_Q2_FIRSTLAST_DURATIONS, amounts: VIDU_Q2_FAST_720.slice(0, 8), audioDelta: VIDU_Q2_AUDIO_DELTA }),
        ...buildViduAudioTiers({ mode: 'firstlastframe', resolution: '1080p', durations: VIDU_Q2_FIRSTLAST_DURATIONS, amounts: VIDU_Q2_FAST_1080.slice(0, 8), audioDelta: VIDU_Q2_AUDIO_DELTA }),
      ],
    },
  },
  {
    apiType: 'video',
    provider: 'vidu',
    modelId: 'viduq2-pro',
    pricing: {
      mode: 'capability',
      tiers: [
        ...buildViduAudioTiers({ mode: 'normal', resolution: '540p', durations: VIDU_Q2_NORMAL_DURATIONS, amounts: VIDU_Q2_PRO_540, audioDelta: VIDU_Q2_AUDIO_DELTA }),
        ...buildViduAudioTiers({ mode: 'normal', resolution: '720p', durations: VIDU_Q2_NORMAL_DURATIONS, amounts: VIDU_Q2_PRO_720, audioDelta: VIDU_Q2_AUDIO_DELTA }),
        ...buildViduAudioTiers({ mode: 'normal', resolution: '1080p', durations: VIDU_Q2_NORMAL_DURATIONS, amounts: VIDU_Q2_PRO_1080, audioDelta: VIDU_Q2_AUDIO_DELTA }),
        ...buildViduAudioTiers({ mode: 'firstlastframe', resolution: '540p', durations: VIDU_Q2_FIRSTLAST_DURATIONS, amounts: VIDU_Q2_PRO_540.slice(0, 8), audioDelta: VIDU_Q2_AUDIO_DELTA }),
        ...buildViduAudioTiers({ mode: 'firstlastframe', resolution: '720p', durations: VIDU_Q2_FIRSTLAST_DURATIONS, amounts: VIDU_Q2_PRO_720.slice(0, 8), audioDelta: VIDU_Q2_AUDIO_DELTA }),
        ...buildViduAudioTiers({ mode: 'firstlastframe', resolution: '1080p', durations: VIDU_Q2_FIRSTLAST_DURATIONS, amounts: VIDU_Q2_PRO_1080.slice(0, 8), audioDelta: VIDU_Q2_AUDIO_DELTA }),
      ],
    },
  },
  {
    apiType: 'video',
    provider: 'vidu',
    modelId: 'viduq2-turbo',
    pricing: {
      mode: 'capability',
      tiers: [
        ...buildViduAudioTiers({ mode: 'normal', resolution: '540p', durations: VIDU_Q2_NORMAL_DURATIONS, amounts: VIDU_Q2_TURBO_540, audioDelta: VIDU_Q2_AUDIO_DELTA }),
        ...buildViduAudioTiers({ mode: 'normal', resolution: '720p', durations: VIDU_Q2_NORMAL_DURATIONS, amounts: VIDU_Q2_TURBO_720, audioDelta: VIDU_Q2_AUDIO_DELTA }),
        ...buildViduAudioTiers({ mode: 'normal', resolution: '1080p', durations: VIDU_Q2_NORMAL_DURATIONS, amounts: VIDU_Q2_TURBO_1080, audioDelta: VIDU_Q2_AUDIO_DELTA }),
        ...buildViduAudioTiers({ mode: 'firstlastframe', resolution: '540p', durations: VIDU_Q2_FIRSTLAST_DURATIONS, amounts: VIDU_Q2_TURBO_540.slice(0, 8), audioDelta: VIDU_Q2_AUDIO_DELTA }),
        ...buildViduAudioTiers({ mode: 'firstlastframe', resolution: '720p', durations: VIDU_Q2_FIRSTLAST_DURATIONS, amounts: VIDU_Q2_TURBO_720.slice(0, 8), audioDelta: VIDU_Q2_AUDIO_DELTA }),
        ...buildViduAudioTiers({ mode: 'firstlastframe', resolution: '1080p', durations: VIDU_Q2_FIRSTLAST_DURATIONS, amounts: VIDU_Q2_TURBO_1080.slice(0, 8), audioDelta: VIDU_Q2_AUDIO_DELTA }),
      ],
    },
  },
  {
    apiType: 'video',
    provider: 'vidu',
    modelId: 'viduq1',
    pricing: {
      mode: 'capability',
      tiers: [
        ...buildViduSilentTiers({ mode: 'normal', resolution: '1080p', durations: [5], amounts: [2.5] }),
        ...buildViduSilentTiers({ mode: 'firstlastframe', resolution: '1080p', durations: [5], amounts: [2.5] }),
      ],
    },
  },
  {
    apiType: 'video',
    provider: 'vidu',
    modelId: 'viduq1-classic',
    pricing: {
      mode: 'capability',
      tiers: [
        ...buildViduSilentTiers({ mode: 'normal', resolution: '1080p', durations: [5], amounts: [2.5] }),
        ...buildViduSilentTiers({ mode: 'firstlastframe', resolution: '1080p', durations: [5], amounts: [2.5] }),
      ],
    },
  },
  {
    apiType: 'video',
    provider: 'vidu',
    modelId: 'vidu2.0',
    pricing: {
      mode: 'capability',
      tiers: [
        ...buildViduSilentTiers({ mode: 'normal', resolution: '360p', durations: [4], amounts: [0.625] }),
        ...buildViduSilentTiers({ mode: 'normal', resolution: '720p', durations: [4, 8], amounts: [1.25, 3.125] }),
        ...buildViduSilentTiers({ mode: 'normal', resolution: '1080p', durations: [4], amounts: [3.125] }),
        ...buildViduSilentTiers({ mode: 'firstlastframe', resolution: '360p', durations: [4], amounts: [0.625] }),
        ...buildViduSilentTiers({ mode: 'firstlastframe', resolution: '720p', durations: [4, 8], amounts: [1.25, 3.125] }),
        ...buildViduSilentTiers({ mode: 'firstlastframe', resolution: '1080p', durations: [4], amounts: [3.125] }),
      ],
    },
  },
  {
    apiType: 'lip-sync',
    provider: 'vidu',
    modelId: 'vidu-lipsync',
    pricing: { mode: 'flat', flatAmount: 0.5 },
  },
] as const

export const VIDU_VIDEO_OPTION_SCHEMA_CONFIG = {
  allowedKeys: VIDU_VIDEO_OPTION_ALLOWED_KEYS,
  objectValidatorKind: 'viduVideo',
  validators: {
    generationMode: { kind: 'enum', values: VIDU_VIDEO_MODES },
    bgm: { kind: 'boolean' },
    isRec: { kind: 'boolean' },
    is_rec: { kind: 'boolean' },
    offPeak: { kind: 'boolean' },
    off_peak: { kind: 'boolean' },
    watermark: { kind: 'boolean' },
    voiceId: { kind: 'nonEmptyString' },
    voice_id: { kind: 'nonEmptyString' },
    wmUrl: { kind: 'nonEmptyString' },
    wm_url: { kind: 'nonEmptyString' },
    metaData: { kind: 'nonEmptyString' },
    meta_data: { kind: 'nonEmptyString' },
    callbackUrl: { kind: 'nonEmptyString' },
    callback_url: { kind: 'nonEmptyString' },
  },
} satisfies MediaOptionSchemaConfig
