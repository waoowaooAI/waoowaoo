import type { MediaOptionSchemaConfig } from '@/lib/ai-providers/shared/media-option-schema-config'
import type { AiOptionSchema } from '@/lib/ai-registry/types'
import {
  buildMediaOptionSchema,
  createMinimaxVideoObjectValidator,
  enumValidator,
  nonEmptyStringValidator,
  type MediaModality,
} from '@/lib/ai-providers/shared/option-schema'

export const MINIMAX_VIDEO_MODES = ['normal', 'firstlastframe'] as const

export const MINIMAX_BUILTIN_CAPABILITY_CATALOG_ENTRIES = [
  {
    modelType: 'video',
    provider: 'minimax',
    modelId: 'minimax-hailuo-2.3',
    capabilities: {
      video: {
        generationModeOptions: ['normal'],
        durationOptions: [6, 10],
        resolutionOptions: ['768p', '1080p'],
        firstlastframe: false,
        supportGenerateAudio: false,
      },
    },
  },
  {
    modelType: 'video',
    provider: 'minimax',
    modelId: 'minimax-hailuo-2.3-fast',
    capabilities: {
      video: {
        generationModeOptions: ['normal'],
        durationOptions: [6, 10],
        resolutionOptions: ['768p', '1080p'],
        firstlastframe: false,
        supportGenerateAudio: false,
      },
    },
  },
  {
    modelType: 'video',
    provider: 'minimax',
    modelId: 'minimax-hailuo-02',
    capabilities: {
      video: {
        generationModeOptions: ['normal', 'firstlastframe'],
        durationOptions: [6, 10],
        resolutionOptions: ['512p', '768p', '1080p'],
        firstlastframe: true,
        supportGenerateAudio: false,
      },
    },
  },
  {
    modelType: 'video',
    provider: 'minimax',
    modelId: 't2v-01',
    capabilities: {
      video: {
        generationModeOptions: ['normal'],
        durationOptions: [6],
        resolutionOptions: ['720p'],
        firstlastframe: false,
        supportGenerateAudio: false,
      },
    },
  },
  {
    modelType: 'video',
    provider: 'minimax',
    modelId: 't2v-01-director',
    capabilities: {
      video: {
        generationModeOptions: ['normal'],
        durationOptions: [6],
        resolutionOptions: ['720p'],
        firstlastframe: false,
        supportGenerateAudio: false,
      },
    },
  },
] as const

export type ResolutionDurationRule = { resolution: string; durations: readonly number[] }

export const MINIMAX_VIDEO_SPECS: Record<string, {
  supportsFirstLastFrame: boolean
  normalRules: readonly ResolutionDurationRule[]
  firstLastFrameRules?: readonly ResolutionDurationRule[]
}> = {
  'minimax-hailuo-2.3': {
    supportsFirstLastFrame: false,
    normalRules: [{ resolution: '768P', durations: [6, 10] }, { resolution: '1080P', durations: [6] }],
  },
  'minimax-hailuo-2.3-fast': {
    supportsFirstLastFrame: false,
    normalRules: [{ resolution: '768P', durations: [6, 10] }, { resolution: '1080P', durations: [6] }],
  },
  'minimax-hailuo-02': {
    supportsFirstLastFrame: true,
    normalRules: [{ resolution: '512P', durations: [6, 10] }, { resolution: '768P', durations: [6, 10] }, { resolution: '1080P', durations: [6] }],
    firstLastFrameRules: [{ resolution: '768P', durations: [6, 10] }, { resolution: '1080P', durations: [6] }],
  },
  't2v-01': {
    supportsFirstLastFrame: false,
    normalRules: [{ resolution: '720P', durations: [6] }],
  },
  't2v-01-director': {
    supportsFirstLastFrame: false,
    normalRules: [{ resolution: '720P', durations: [6] }],
  },
}

function minimaxPricingTiers(
  tiers: ReadonlyArray<readonly [generationMode: 'normal' | 'firstlastframe', resolution: string, duration: number, amount: number]>,
) {
  return {
    mode: 'capability' as const,
    tiers: tiers.map(([generationMode, resolution, duration, amount]) => ({
      when: { generationMode, resolution, duration },
      amount,
    })),
  }
}

export const MINIMAX_BUILTIN_PRICING_CATALOG_ENTRIES = [
  {
    apiType: 'video',
    provider: 'minimax',
    modelId: 'minimax-hailuo-2.3',
    pricing: minimaxPricingTiers([
      ['normal', '768p', 6, 2],
      ['normal', '768p', 10, 4],
      ['normal', '1080p', 6, 3.5],
    ]),
  },
  {
    apiType: 'video',
    provider: 'minimax',
    modelId: 'minimax-hailuo-2.3-fast',
    pricing: minimaxPricingTiers([
      ['normal', '768p', 6, 1.35],
      ['normal', '768p', 10, 2.25],
      ['normal', '1080p', 6, 2.31],
    ]),
  },
  {
    apiType: 'video',
    provider: 'minimax',
    modelId: 'minimax-hailuo-02',
    pricing: minimaxPricingTiers([
      ['normal', '512p', 6, 0.6],
      ['normal', '512p', 10, 1],
      ['normal', '768p', 6, 2],
      ['normal', '768p', 10, 4],
      ['normal', '1080p', 6, 3.5],
      ['firstlastframe', '768p', 6, 2],
      ['firstlastframe', '768p', 10, 4],
      ['firstlastframe', '1080p', 6, 3.5],
    ]),
  },
  {
    apiType: 'video',
    provider: 'minimax',
    modelId: 't2v-01',
    pricing: minimaxPricingTiers([
      ['normal', '720p', 6, 3],
    ]),
  },
  {
    apiType: 'video',
    provider: 'minimax',
    modelId: 't2v-01-director',
    pricing: minimaxPricingTiers([
      ['normal', '720p', 6, 6],
    ]),
  },
] as const

export const MINIMAX_VIDEO_OPTION_SCHEMA_CONFIG = {
  allowedKeys: ['generationMode'],
  objectValidatorKind: 'minimaxVideo',
  validators: {
    generationMode: { kind: 'enum', values: MINIMAX_VIDEO_MODES },
    aspectRatio: { kind: 'nonEmptyString' },
    lastFrameImageUrl: { kind: 'nonEmptyString' },
  },
} satisfies MediaOptionSchemaConfig

export function resolveMinimaxOptionSchema(modality: MediaModality, modelId: string): AiOptionSchema {
  if (modality === 'video') {
    return buildMediaOptionSchema('video', {
      ...MINIMAX_VIDEO_OPTION_SCHEMA_CONFIG,
      validators: {
        generationMode: enumValidator(MINIMAX_VIDEO_MODES),
        aspectRatio: nonEmptyStringValidator(),
        lastFrameImageUrl: nonEmptyStringValidator(),
      },
      objectValidators: [createMinimaxVideoObjectValidator({ modelId, specs: MINIMAX_VIDEO_SPECS })],
    })
  }
  return buildMediaOptionSchema(modality)
}
