import type { MediaOptionSchemaConfig } from '@/lib/ai-providers/shared/media-option-schema-config'
import type { AiOptionSchema } from '@/lib/ai-registry/types'
import {
  booleanValidator,
  buildMediaOptionSchema,
  createOpenAiCompatibleVideoObjectValidator,
  enumValidator,
  nonEmptyStringValidator,
  type MediaModality,
} from '@/lib/ai-providers/shared/option-schema'

export const OPENAI_IMAGE_SIZES = ['auto', '1024x1024', '1536x1024', '1024x1536', '256x256', '512x512', '1792x1024', '1024x1792'] as const
export const OPENAI_IMAGE_OUTPUT_FORMATS = ['png', 'jpeg', 'webp'] as const
export const OPENAI_IMAGE_RESPONSE_FORMATS = ['url', 'b64_json'] as const
export const OPENAI_IMAGE_QUALITIES = ['standard', 'hd', 'low', 'medium', 'high', 'auto'] as const
export const OPENAI_VIDEO_DURATIONS = ['4', '8', '12'] as const
export const OPENAI_VIDEO_RATIOS = new Set(['16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9', '9:21', '1:1', 'auto'])
export const OPENAI_VIDEO_SIZES = new Set(['720p', '1080p', '720x1280', '1280x720', '1024x1792', '1792x1024'])

export const OPENAI_COMPATIBLE_IMAGE_OPTION_SCHEMA_CONFIG = {
  conflicts: [{ keys: ['size', 'resolution'], message: 'size_and_resolution_must_match', allowSameValue: true }],
  validators: {
    size: { kind: 'enum', values: OPENAI_IMAGE_SIZES },
    resolution: { kind: 'enum', values: OPENAI_IMAGE_SIZES },
    outputFormat: { kind: 'enum', values: OPENAI_IMAGE_OUTPUT_FORMATS },
    responseFormat: { kind: 'enum', values: OPENAI_IMAGE_RESPONSE_FORMATS },
    quality: { kind: 'enum', values: OPENAI_IMAGE_QUALITIES },
  },
} satisfies MediaOptionSchemaConfig

export const OPENAI_COMPATIBLE_VIDEO_OPTION_SCHEMA_CONFIG = {
  allowedKeys: ['aspect_ratio', 'generationMode'],
  objectValidatorKind: 'openAiCompatibleVideo',
  validators: {
    generateAudio: { kind: 'boolean' },
    generationMode: { kind: 'nonEmptyString' },
  },
} satisfies MediaOptionSchemaConfig

export function resolveOpenAiCompatibleOptionSchema(modality: MediaModality): AiOptionSchema {
  if (modality === 'image') {
    return buildMediaOptionSchema('image', {
      ...OPENAI_COMPATIBLE_IMAGE_OPTION_SCHEMA_CONFIG,
      validators: {
        size: enumValidator(OPENAI_IMAGE_SIZES),
        resolution: enumValidator(OPENAI_IMAGE_SIZES),
        outputFormat: enumValidator(OPENAI_IMAGE_OUTPUT_FORMATS),
        responseFormat: enumValidator(OPENAI_IMAGE_RESPONSE_FORMATS),
        quality: enumValidator(OPENAI_IMAGE_QUALITIES),
      },
    })
  }
  if (modality === 'video') {
    return buildMediaOptionSchema('video', {
      ...OPENAI_COMPATIBLE_VIDEO_OPTION_SCHEMA_CONFIG,
      validators: {
        generateAudio: booleanValidator(),
        generationMode: nonEmptyStringValidator(),
      },
      objectValidators: [createOpenAiCompatibleVideoObjectValidator({
        durations: OPENAI_VIDEO_DURATIONS,
        ratios: OPENAI_VIDEO_RATIOS,
        sizes: OPENAI_VIDEO_SIZES,
      })],
    })
  }
  return buildMediaOptionSchema(modality)
}
