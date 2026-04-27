import type {
  AiOptionObjectValidator,
  AiOptionSchema,
  AiOptionValidationResult,
  AiOptionValidator,
  AiResolvedSelection,
} from '@/lib/ai-registry/types'
import type {
  MediaOptionSchemaConfig,
  MediaOptionValidatorConfig,
} from '@/lib/ai-providers/shared/media-option-schema-config'
import {
  ARK_IMAGE_OPTION_SCHEMA_CONFIG,
  ARK_IMAGE_RATIOS,
  ARK_IMAGE_RESOLUTIONS,
  ARK_VIDEO_OPTION_SCHEMA_CONFIG,
  ARK_VIDEO_RATIOS,
  ARK_VIDEO_SPECS,
} from '@/lib/ai-providers/ark/models'
import {
  BAILIAN_VIDEO_OPTION_SCHEMA_CONFIG,
} from '@/lib/ai-providers/bailian/models'
import {
  FAL_IMAGE_OPTION_SCHEMA_CONFIG,
  FAL_IMAGE_RESOLUTIONS,
  FAL_VIDEO_OPTION_SCHEMA_CONFIG,
  FAL_VIDEO_MODEL_IDS,
} from '@/lib/ai-providers/fal/models'
import {
  MINIMAX_VIDEO_OPTION_SCHEMA_CONFIG,
  MINIMAX_VIDEO_MODES,
  MINIMAX_VIDEO_SPECS,
  type ResolutionDurationRule,
} from '@/lib/ai-providers/minimax/models'
import {
  OPENAI_COMPATIBLE_IMAGE_OPTION_SCHEMA_CONFIG,
  OPENAI_COMPATIBLE_VIDEO_OPTION_SCHEMA_CONFIG,
  OPENAI_IMAGE_OUTPUT_FORMATS,
  OPENAI_IMAGE_QUALITIES,
  OPENAI_IMAGE_RESPONSE_FORMATS,
  OPENAI_IMAGE_SIZES,
  OPENAI_VIDEO_DURATIONS,
  OPENAI_VIDEO_RATIOS,
  OPENAI_VIDEO_SIZES,
} from '@/lib/ai-providers/openai-compatible/models'
import {
  VIDU_VIDEO_OPTION_ALLOWED_KEYS,
  VIDU_AUDIO_TYPES,
  VIDU_MAX_PAYLOAD_LENGTH,
  VIDU_MOVEMENT_AMPLITUDES,
  VIDU_Q2_EXTRA_RATIOS,
  VIDU_RATIO_PATTERN,
  VIDU_STANDARD_RATIOS,
  VIDU_VIDEO_OPTION_SCHEMA_CONFIG,
  VIDU_VIDEO_MODES,
  VIDU_VIDEO_SPECS,
  type ViduSpec,
} from '@/lib/ai-providers/vidu/models'

export type MediaModality = 'image' | 'video' | 'audio'

type MediaOptionSchemaOverride = Omit<MediaOptionSchemaConfig, 'validators'> & {
  objectValidators?: readonly AiOptionObjectValidator[]
  validators?: Readonly<Record<string, AiOptionValidator>>
}

function passthroughValidator(): AiOptionValidationResult {
  return { ok: true }
}

function enumValidator(values: readonly string[]): AiOptionValidator {
  const allowedValues = new Set(values)
  return (value) => {
    if (value === undefined) return { ok: true }
    if (typeof value !== 'string') return { ok: false, reason: 'expected_string' }
    return allowedValues.has(value)
      ? { ok: true }
      : { ok: false, reason: `unsupported_value=${value}` }
  }
}

function integerRangeValidator(input: { min?: number; max?: number }): AiOptionValidator {
  return (value) => {
    if (value === undefined) return { ok: true }
    if (typeof value !== 'number' || !Number.isInteger(value)) return { ok: false, reason: 'expected_integer' }
    if (input.min !== undefined && value < input.min) return { ok: false, reason: `min=${input.min}` }
    if (input.max !== undefined && value > input.max) return { ok: false, reason: `max=${input.max}` }
    return { ok: true }
  }
}

function booleanValidator(): AiOptionValidator {
  return (value) => {
    if (value === undefined) return { ok: true }
    return typeof value === 'boolean' ? { ok: true } : { ok: false, reason: 'expected_boolean' }
  }
}

function nonEmptyStringValidator(): AiOptionValidator {
  return (value) => {
    if (value === undefined) return { ok: true }
    return typeof value === 'string' && value.trim().length > 0
      ? { ok: true }
      : { ok: false, reason: 'expected_non_empty_string' }
  }
}

function buildValidatorFromConfig(config: MediaOptionValidatorConfig): AiOptionValidator {
  if (config.kind === 'enum') return enumValidator(config.values)
  if (config.kind === 'integer') return integerRangeValidator({ min: config.min, max: config.max })
  if (config.kind === 'boolean') return booleanValidator()
  return nonEmptyStringValidator()
}

function buildValidatorsFromConfig(
  validators: MediaOptionSchemaConfig['validators'],
): Readonly<Record<string, AiOptionValidator>> {
  if (!validators) return {}
  return Object.fromEntries(
    Object.entries(validators).map(([key, value]) => [key, buildValidatorFromConfig(value)]),
  )
}

function pickFirstDefined(options: Readonly<Record<string, unknown>>, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (options[key] !== undefined) return options[key]
  }
  return undefined
}

function buildAllowedKeys(modality: MediaModality): ReadonlySet<string> {
  if (modality === 'image') {
    return new Set([
      'provider',
      'modelId',
      'modelKey',
      'referenceImages',
      'aspectRatio',
      'resolution',
      'outputFormat',
      'keepOriginalAspectRatio',
      'size',
      'quality',
      'responseFormat',
    ])
  }
  if (modality === 'video') {
    return new Set([
      'provider',
      'modelId',
      'modelKey',
      'prompt',
      'duration',
      'fps',
      'resolution',
      'aspectRatio',
      'generateAudio',
      'lastFrameImageUrl',
      'size',
      'promptExtend',
      'serviceTier',
      'executionExpiresAfter',
      'returnLastFrame',
      'draft',
      'seed',
      'cameraFixed',
      'watermark',
    ])
  }
  return new Set(['provider', 'modelId', 'modelKey', 'voice', 'rate'])
}

export function buildMediaOptionSchema(
  modality: MediaModality,
  override?: MediaOptionSchemaOverride,
): AiOptionSchema {
  const allowedKeys = new Set([
    ...Array.from(buildAllowedKeys(modality)),
    ...(override?.allowedKeys || []),
  ])
  const validators = Object.fromEntries(
    Array.from(allowedKeys).map((key) => [key, passthroughValidator]),
  ) as Record<string, AiOptionValidator>
  for (const [key, validator] of Object.entries(override?.validators || {})) {
    validators[key] = validator
  }
  return {
    allowedKeys,
    required: override?.required,
    requiresOneOf: override?.requiresOneOf,
    conflicts: override?.conflicts,
    validators,
    objectValidators: override?.objectValidators,
  }
}

function normalizeMinimaxResolution(value: string): string | null {
  const normalized = value.trim().toLowerCase()
  if (normalized.includes('512')) return '512P'
  if (normalized.includes('768')) return '768P'
  if (normalized.includes('720')) return '720P'
  if (normalized.includes('1080')) return '1080P'
  return null
}

function validateResolutionDuration(input: {
  modelId: string
  rules: readonly ResolutionDurationRule[]
  resolution?: string
  duration?: number
}): AiOptionValidationResult {
  if (input.rules.length === 0) return { ok: false, reason: `no_rules_for_${input.modelId}` }
  if (input.resolution) {
    const matchedRule = input.rules.find((rule) => rule.resolution === input.resolution)
    if (!matchedRule) return { ok: false, reason: `resolution=${input.resolution}_for_${input.modelId}` }
    if (input.duration !== undefined && !matchedRule.durations.includes(input.duration)) {
      return { ok: false, reason: `duration=${input.duration}_for_resolution=${input.resolution}_in_${input.modelId}` }
    }
    return { ok: true }
  }
  if (input.duration === undefined) return { ok: true }
  const duration = input.duration
  return input.rules.some((rule) => rule.durations.includes(duration))
    ? { ok: true }
    : { ok: false, reason: `duration=${input.duration}_for_${input.modelId}` }
}

function minimaxVideoObjectValidator(modelId: string): AiOptionObjectValidator {
  return (options) => {
    const spec = MINIMAX_VIDEO_SPECS[modelId]
    if (!spec) return { ok: false, reason: `modelId=${modelId}` }
    const rawMode = options.generationMode
    if (rawMode !== undefined && rawMode !== 'normal' && rawMode !== 'firstlastframe') {
      return { ok: false, reason: `generationMode=${String(rawMode)}` }
    }
    const hasLastFrame = typeof options.lastFrameImageUrl === 'string' && options.lastFrameImageUrl.trim().length > 0
    const inferredMode = hasLastFrame ? 'firstlastframe' : 'normal'
    const mode = rawMode === undefined ? inferredMode : rawMode
    if (mode !== inferredMode) return { ok: false, reason: `generationMode=${String(rawMode)}` }
    if (mode === 'firstlastframe' && !spec.supportsFirstLastFrame) return { ok: false, reason: `generationMode=firstlastframe_for_${modelId}` }
    const rawResolution = options.resolution
    let resolution: string | undefined
    if (rawResolution !== undefined) {
      if (typeof rawResolution !== 'string') return { ok: false, reason: 'resolution=expected_string' }
      const normalizedResolution = normalizeMinimaxResolution(rawResolution)
      if (!normalizedResolution) return { ok: false, reason: `resolution=${rawResolution}` }
      resolution = normalizedResolution
    }
    const rawDuration = options.duration
    if (rawDuration !== undefined && (typeof rawDuration !== 'number' || !Number.isInteger(rawDuration))) return { ok: false, reason: 'duration=expected_integer' }
    const rules = mode === 'firstlastframe' ? (spec.firstLastFrameRules || []) : spec.normalRules
    const rulesResult = validateResolutionDuration({ modelId, rules, resolution, duration: rawDuration as number | undefined })
    if (!rulesResult.ok) return rulesResult
    if (options.generateAudio === true) return { ok: false, reason: `generateAudio_for_${modelId}` }
    if (options.generateAudio !== undefined && typeof options.generateAudio !== 'boolean') return { ok: false, reason: `generateAudio=${String(options.generateAudio)}` }
    return { ok: true }
  }
}

function isViduRatioAllowed(profile: ViduSpec['aspectRatioProfile'], ratio: string): boolean {
  if (VIDU_STANDARD_RATIOS.has(ratio)) return true
  if (profile !== 'q2-flex') return false
  if (VIDU_Q2_EXTRA_RATIOS.has(ratio)) return true
  const match = ratio.match(VIDU_RATIO_PATTERN)
  if (!match) return false
  const width = Number(match[1])
  const height = Number(match[2])
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0
}

function viduVideoObjectValidator(modelId: string): AiOptionObjectValidator {
  return (options) => {
    const spec = VIDU_VIDEO_SPECS[modelId]
    if (!spec) return { ok: false, reason: `modelId=${modelId}` }
    const lastFrame = options.lastFrameImageUrl
    if (lastFrame !== undefined && (typeof lastFrame !== 'string' || lastFrame.trim().length === 0)) return { ok: false, reason: 'lastFrameImageUrl=expected_non_empty_string' }
    const inferredMode = typeof lastFrame === 'string' && lastFrame.trim().length > 0 ? 'firstlastframe' : 'normal'
    const rawMode = options.generationMode
    if (rawMode !== undefined && rawMode !== 'normal' && rawMode !== 'firstlastframe') return { ok: false, reason: `generationMode=${String(rawMode)}` }
    const mode = rawMode === undefined ? inferredMode : rawMode
    if (mode !== inferredMode) return { ok: false, reason: `generationMode=${String(rawMode)}` }
    if (mode === 'firstlastframe' && !spec.supportsFirstLastFrame) return { ok: false, reason: `firstlastframe_for_${modelId}` }
    const modeSpec = mode === 'firstlastframe' ? spec.firstLast : spec.normal
    if (!modeSpec) return { ok: false, reason: `firstlastframe_for_${modelId}` }
    const rawDuration = options.duration
    if (rawDuration !== undefined && (typeof rawDuration !== 'number' || !Number.isInteger(rawDuration))) return { ok: false, reason: 'duration=expected_integer' }
    if (typeof rawDuration === 'number' && !modeSpec.durationOptions.includes(rawDuration)) return { ok: false, reason: `duration=${rawDuration}` }
    const duration = typeof rawDuration === 'number' ? rawDuration : modeSpec.durationOptions[0]
    const rawResolution = options.resolution
    if (rawResolution !== undefined) {
      if (typeof rawResolution !== 'string' || rawResolution.trim().length === 0) return { ok: false, reason: 'resolution=expected_non_empty_string' }
      if (!(modeSpec.resolutionByDuration[duration] || []).includes(rawResolution.trim())) return { ok: false, reason: `resolution=${rawResolution.trim()}` }
    }
    const rawRatio = pickFirstDefined(options, ['aspectRatio', 'aspect_ratio'])
    if (rawRatio !== undefined) {
      if (typeof rawRatio !== 'string' || rawRatio.trim().length === 0) return { ok: false, reason: 'aspectRatio=expected_non_empty_string' }
      if (!isViduRatioAllowed(spec.aspectRatioProfile, rawRatio.trim())) return { ok: false, reason: `aspectRatio=${rawRatio.trim()}` }
    }
    const rawGenerateAudio = pickFirstDefined(options, ['generateAudio', 'audio'])
    if (rawGenerateAudio !== undefined && typeof rawGenerateAudio !== 'boolean') return { ok: false, reason: 'generateAudio=expected_boolean' }
    const generateAudio = rawGenerateAudio === true
    if (generateAudio && !spec.supportsGenerateAudio) return { ok: false, reason: `generateAudio_for_${modelId}` }
    const audioType = pickFirstDefined(options, ['audioType', 'audio_type'])
    if (audioType !== undefined) {
      if (typeof audioType !== 'string' || audioType.trim().length === 0) return { ok: false, reason: 'audioType=expected_non_empty_string' }
      if (!VIDU_AUDIO_TYPES.has(audioType.trim())) return { ok: false, reason: `audioType=${audioType}` }
      if (!generateAudio) return { ok: false, reason: 'audioType_requires_generateAudio' }
    }
    const movementAmplitude = pickFirstDefined(options, ['movementAmplitude', 'movement_amplitude'])
    if (movementAmplitude !== undefined) {
      if (typeof movementAmplitude !== 'string' || movementAmplitude.trim().length === 0) return { ok: false, reason: 'movementAmplitude=expected_non_empty_string' }
      if (!VIDU_MOVEMENT_AMPLITUDES.has(movementAmplitude.trim())) return { ok: false, reason: `movementAmplitude=${movementAmplitude}` }
    }
    const payload = options.payload
    if (payload !== undefined) {
      if (typeof payload !== 'string' || payload.trim().length === 0) return { ok: false, reason: 'payload=expected_non_empty_string' }
      if (payload.length > VIDU_MAX_PAYLOAD_LENGTH) return { ok: false, reason: `payload_length>${VIDU_MAX_PAYLOAD_LENGTH}` }
    }
    const wmPosition = pickFirstDefined(options, ['wmPosition', 'wm_position'])
    if (wmPosition !== undefined) {
      if (typeof wmPosition !== 'number' || !Number.isInteger(wmPosition)) return { ok: false, reason: 'wmPosition=expected_integer' }
      if (wmPosition < 1 || wmPosition > 4) return { ok: false, reason: `wmPosition=${wmPosition}` }
    }
    return { ok: true }
  }
}

function openAiCompatibleVideoObjectValidator(): AiOptionObjectValidator {
  return (options) => {
    const duration = options.duration
    if (duration !== undefined && duration !== 4 && duration !== 8 && duration !== 12 && !OPENAI_VIDEO_DURATIONS.includes(String(duration) as typeof OPENAI_VIDEO_DURATIONS[number])) {
      return { ok: false, reason: `duration=${String(duration)}` }
    }
    const aspectRatio = pickFirstDefined(options, ['aspectRatio', 'aspect_ratio'])
    if (aspectRatio !== undefined && (typeof aspectRatio !== 'string' || !OPENAI_VIDEO_RATIOS.has(aspectRatio.trim()))) return { ok: false, reason: `aspectRatio=${String(aspectRatio)}` }
    const rawSize = options.size
    const rawResolution = options.resolution
    for (const [key, value] of [['size', rawSize], ['resolution', rawResolution]] as const) {
      if (value !== undefined && (typeof value !== 'string' || !OPENAI_VIDEO_SIZES.has(value.trim()))) return { ok: false, reason: `${key}=${String(value)}` }
    }
    if (typeof rawSize === 'string' && typeof rawResolution === 'string' && rawSize.trim() !== rawResolution.trim()) return { ok: false, reason: 'size_and_resolution_must_match' }
    return { ok: true }
  }
}

function falVideoObjectValidator(modelId: string): AiOptionObjectValidator {
  return () => FAL_VIDEO_MODEL_IDS.has(modelId) ? { ok: true } : { ok: false, reason: `modelId=${modelId}` }
}

function resolveObjectValidators(input: {
  config: MediaOptionSchemaConfig
  selection: AiResolvedSelection
}): readonly AiOptionObjectValidator[] | undefined {
  const kind = input.config.objectValidatorKind
  if (!kind) return undefined
  if (kind === 'falVideoModel') return [falVideoObjectValidator(input.selection.modelId)]
  if (kind === 'minimaxVideo') return [minimaxVideoObjectValidator(input.selection.modelId)]
  if (kind === 'viduVideo') return [viduVideoObjectValidator(input.selection.modelId)]
  return [openAiCompatibleVideoObjectValidator()]
}

export function buildProviderSchemaOverride(input: {
  modality: MediaModality
  providerKey: string
  selection: AiResolvedSelection
}): MediaOptionSchemaOverride {
  if (input.modality === 'image' && input.providerKey === 'ark') {
    return {
      ...ARK_IMAGE_OPTION_SCHEMA_CONFIG,
      validators: buildValidatorsFromConfig(ARK_IMAGE_OPTION_SCHEMA_CONFIG.validators),
    }
  }
  if (input.modality === 'image' && input.providerKey === 'fal') {
    return {
      ...FAL_IMAGE_OPTION_SCHEMA_CONFIG,
      validators: {
        ...buildValidatorsFromConfig(FAL_IMAGE_OPTION_SCHEMA_CONFIG.validators),
        outputFormat: enumValidator(OPENAI_IMAGE_OUTPUT_FORMATS),
      },
    }
  }
  if (input.modality === 'image' && input.providerKey === 'openai-compatible') {
    return {
      ...OPENAI_COMPATIBLE_IMAGE_OPTION_SCHEMA_CONFIG,
      validators: buildValidatorsFromConfig(OPENAI_COMPATIBLE_IMAGE_OPTION_SCHEMA_CONFIG.validators),
    }
  }
  if (input.modality === 'video' && input.providerKey === 'ark') {
    const spec = ARK_VIDEO_SPECS[input.selection.modelId]
    return {
      ...ARK_VIDEO_OPTION_SCHEMA_CONFIG,
      validators: {
        ...buildValidatorsFromConfig(ARK_VIDEO_OPTION_SCHEMA_CONFIG.validators),
        resolution: enumValidator(spec?.resolutions || ['480p', '720p', '1080p']),
        duration: integerRangeValidator({ min: spec?.durationMin, max: spec?.durationMax }),
      },
    }
  }
  if (input.modality === 'video' && input.providerKey === 'bailian') {
    return {
      ...BAILIAN_VIDEO_OPTION_SCHEMA_CONFIG,
      validators: buildValidatorsFromConfig(BAILIAN_VIDEO_OPTION_SCHEMA_CONFIG.validators),
    }
  }
  if (input.modality === 'video' && input.providerKey === 'fal') {
    return {
      ...FAL_VIDEO_OPTION_SCHEMA_CONFIG,
      validators: buildValidatorsFromConfig(FAL_VIDEO_OPTION_SCHEMA_CONFIG.validators),
      objectValidators: resolveObjectValidators({ config: FAL_VIDEO_OPTION_SCHEMA_CONFIG, selection: input.selection }),
    }
  }
  if (input.modality === 'video' && input.providerKey === 'minimax') {
    return {
      ...MINIMAX_VIDEO_OPTION_SCHEMA_CONFIG,
      validators: buildValidatorsFromConfig(MINIMAX_VIDEO_OPTION_SCHEMA_CONFIG.validators),
      objectValidators: resolveObjectValidators({ config: MINIMAX_VIDEO_OPTION_SCHEMA_CONFIG, selection: input.selection }),
    }
  }
  if (input.modality === 'video' && input.providerKey === 'vidu') {
    return {
      ...VIDU_VIDEO_OPTION_SCHEMA_CONFIG,
      allowedKeys: VIDU_VIDEO_OPTION_ALLOWED_KEYS,
      validators: buildValidatorsFromConfig(VIDU_VIDEO_OPTION_SCHEMA_CONFIG.validators),
      objectValidators: resolveObjectValidators({ config: VIDU_VIDEO_OPTION_SCHEMA_CONFIG, selection: input.selection }),
    }
  }
  if (input.modality === 'video' && input.providerKey === 'openai-compatible') {
    return {
      ...OPENAI_COMPATIBLE_VIDEO_OPTION_SCHEMA_CONFIG,
      validators: buildValidatorsFromConfig(OPENAI_COMPATIBLE_VIDEO_OPTION_SCHEMA_CONFIG.validators),
      objectValidators: resolveObjectValidators({ config: OPENAI_COMPATIBLE_VIDEO_OPTION_SCHEMA_CONFIG, selection: input.selection }),
    }
  }
  return {}
}
