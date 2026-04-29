import type { AiOptionObjectValidator, AiOptionSchema } from '@/lib/ai-registry/types'
import {
  enumValidator,
  integerRangeValidator,
  buildMediaOptionSchema,
  type MediaModality,
} from '@/lib/ai-providers/shared/option-schema'
import {
  OPENAI_IMAGE_BACKGROUNDS,
  OPENAI_IMAGE_MODERATION_LEVELS,
  OPENAI_IMAGE_OUTPUT_FORMATS,
  OPENAI_OFFICIAL_IMAGE_QUALITIES,
  OPENAI_OFFICIAL_IMAGE_SIZES,
} from '@/lib/ai-providers/shared/openai-image'

export const OPENAI_IMAGE_2_MODEL_ID = 'gpt-image-2'

export const OPENAI_BUILTIN_CAPABILITY_CATALOG_ENTRIES = [
  {
    modelType: 'image',
    provider: 'openai',
    modelId: OPENAI_IMAGE_2_MODEL_ID,
    capabilities: { image: { resolutionOptions: [...OPENAI_OFFICIAL_IMAGE_SIZES] } },
  },
] as const

export const OPENAI_BUILTIN_PRICING_CATALOG_ENTRIES: readonly unknown[] = [] as const

export const OPENAI_API_CONFIG_CATALOG_MODELS = [
  { modelId: OPENAI_IMAGE_2_MODEL_ID, name: 'GPT Image 2', type: 'image', provider: 'openai' },
] as const

const openAiImageObjectValidator: AiOptionObjectValidator = (options) => {
  if (options.responseFormat !== undefined) {
    return { ok: false, reason: 'responseFormat_unsupported' }
  }
  if (options.outputCompression !== undefined) {
    const outputFormat = options.outputFormat
    if (outputFormat !== 'jpeg' && outputFormat !== 'webp') {
      return { ok: false, reason: 'outputCompression_requires_jpeg_or_webp' }
    }
  }
  if (options.background === 'transparent' && options.outputFormat === 'jpeg') {
    return { ok: false, reason: 'transparent_background_requires_png_or_webp' }
  }
  return { ok: true }
}

export function resolveOpenAiOptionSchema(modality: MediaModality): AiOptionSchema {
  if (modality === 'image') {
    return buildMediaOptionSchema('image', {
      allowedKeys: ['background', 'outputCompression', 'moderation'],
      conflicts: [{ keys: ['size', 'resolution'], message: 'size_and_resolution_must_match', allowSameValue: true }],
      validators: {
        size: enumValidator(OPENAI_OFFICIAL_IMAGE_SIZES),
        resolution: enumValidator(OPENAI_OFFICIAL_IMAGE_SIZES),
        outputFormat: enumValidator(OPENAI_IMAGE_OUTPUT_FORMATS),
        quality: enumValidator(OPENAI_OFFICIAL_IMAGE_QUALITIES),
        background: enumValidator(OPENAI_IMAGE_BACKGROUNDS),
        moderation: enumValidator(OPENAI_IMAGE_MODERATION_LEVELS),
        outputCompression: integerRangeValidator({ min: 0, max: 100 }),
      },
      objectValidators: [openAiImageObjectValidator],
    })
  }
  return buildMediaOptionSchema(modality)
}
