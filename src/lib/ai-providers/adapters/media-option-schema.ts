import type {
  AiOptionObjectValidator,
  AiOptionSchema,
  AiOptionValidationResult,
  AiOptionValidator,
  AiResolvedMediaSelection,
} from '@/lib/ai-registry/types'
import {
  ARK_IMAGE_RATIOS,
  ARK_IMAGE_RESOLUTIONS,
  ARK_VIDEO_RATIOS,
  ARK_VIDEO_SPECS,
  FAL_IMAGE_RESOLUTIONS,
  FAL_VIDEO_MODEL_IDS,
  MINIMAX_VIDEO_MODES,
  MINIMAX_VIDEO_SPECS,
  OPENAI_IMAGE_OUTPUT_FORMATS,
  OPENAI_IMAGE_QUALITIES,
  OPENAI_IMAGE_RESPONSE_FORMATS,
  OPENAI_IMAGE_SIZES,
  OPENAI_VIDEO_DURATIONS,
  OPENAI_VIDEO_RATIOS,
  OPENAI_VIDEO_SIZES,
  VIDU_AUDIO_TYPES,
  VIDU_MAX_PAYLOAD_LENGTH,
  VIDU_MOVEMENT_AMPLITUDES,
  VIDU_Q2_EXTRA_RATIOS,
  VIDU_RATIO_PATTERN,
  VIDU_STANDARD_RATIOS,
  VIDU_VIDEO_MODES,
  VIDU_VIDEO_SPECS,
  type ResolutionDurationRule,
  type ViduSpec,
} from './models/media-option-models'

export type MediaModality = 'image' | 'video' | 'audio'

type MediaOptionSchemaOverride = {
  allowedKeys?: readonly string[]
  required?: readonly string[]
  requiresOneOf?: AiOptionSchema['requiresOneOf']
  conflicts?: AiOptionSchema['conflicts']
  validators?: Readonly<Record<string, AiOptionValidator>>
  objectValidators?: readonly AiOptionObjectValidator[]
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

export function buildProviderSchemaOverride(input: {
  modality: MediaModality
  providerKey: string
  selection: AiResolvedMediaSelection
}): MediaOptionSchemaOverride {
  if (input.modality === 'image' && input.providerKey === 'ark') {
    return {
      requiresOneOf: [{ keys: ['aspectRatio', 'size'], message: 'aspectRatio_or_size' }],
      validators: { aspectRatio: enumValidator(ARK_IMAGE_RATIOS), resolution: enumValidator(ARK_IMAGE_RESOLUTIONS), size: nonEmptyStringValidator() },
    }
  }
  if (input.modality === 'image' && input.providerKey === 'fal') {
    return { validators: { resolution: enumValidator(FAL_IMAGE_RESOLUTIONS), outputFormat: enumValidator(OPENAI_IMAGE_OUTPUT_FORMATS) } }
  }
  if (input.modality === 'image' && input.providerKey === 'openai-compatible') {
    return {
      conflicts: [{ keys: ['size', 'resolution'], message: 'size_and_resolution_must_match', allowSameValue: true }],
      validators: {
        size: enumValidator(OPENAI_IMAGE_SIZES),
        resolution: enumValidator(OPENAI_IMAGE_SIZES),
        outputFormat: enumValidator(OPENAI_IMAGE_OUTPUT_FORMATS),
        responseFormat: enumValidator(OPENAI_IMAGE_RESPONSE_FORMATS),
        quality: enumValidator(OPENAI_IMAGE_QUALITIES),
      },
    }
  }
  if (input.modality === 'video' && input.providerKey === 'ark') {
    const spec = ARK_VIDEO_SPECS[input.selection.modelId]
    return {
      validators: {
        aspectRatio: enumValidator(ARK_VIDEO_RATIOS),
        resolution: enumValidator(spec?.resolutions || ['480p', '720p', '1080p']),
        duration: integerRangeValidator({ min: spec?.durationMin, max: spec?.durationMax }),
        generateAudio: booleanValidator(),
        returnLastFrame: booleanValidator(),
        draft: booleanValidator(),
        cameraFixed: booleanValidator(),
        watermark: booleanValidator(),
        seed: integerRangeValidator({ min: 0 }),
        serviceTier: enumValidator(['default', 'flex']),
        executionExpiresAfter: integerRangeValidator({ min: 1 }),
      },
    }
  }
  if (input.modality === 'video' && input.providerKey === 'bailian') {
    return { validators: { duration: integerRangeValidator({ min: 1 }), watermark: booleanValidator(), promptExtend: booleanValidator() } }
  }
  if (input.modality === 'video' && input.providerKey === 'fal') {
    return {
      objectValidators: [falVideoObjectValidator(input.selection.modelId)],
      validators: { duration: integerRangeValidator({ min: 1 }), aspectRatio: nonEmptyStringValidator(), resolution: nonEmptyStringValidator() },
    }
  }
  if (input.modality === 'video' && input.providerKey === 'minimax') {
    return {
      allowedKeys: ['generationMode'],
      objectValidators: [minimaxVideoObjectValidator(input.selection.modelId)],
      validators: { generationMode: enumValidator(MINIMAX_VIDEO_MODES), aspectRatio: nonEmptyStringValidator(), lastFrameImageUrl: nonEmptyStringValidator() },
    }
  }
  if (input.modality === 'video' && input.providerKey === 'vidu') {
    return {
      allowedKeys: [
        'aspect_ratio', 'generationMode', 'audio', 'audioType', 'audio_type',
        'movementAmplitude', 'movement_amplitude', 'bgm', 'isRec', 'is_rec',
        'voiceId', 'voice_id', 'payload', 'offPeak', 'off_peak', 'wmPosition',
        'wm_position', 'wmUrl', 'wm_url', 'metaData', 'meta_data', 'callbackUrl', 'callback_url',
      ],
      objectValidators: [viduVideoObjectValidator(input.selection.modelId)],
      validators: {
        generationMode: enumValidator(VIDU_VIDEO_MODES),
        bgm: booleanValidator(),
        isRec: booleanValidator(),
        is_rec: booleanValidator(),
        offPeak: booleanValidator(),
        off_peak: booleanValidator(),
        watermark: booleanValidator(),
        voiceId: nonEmptyStringValidator(),
        voice_id: nonEmptyStringValidator(),
        wmUrl: nonEmptyStringValidator(),
        wm_url: nonEmptyStringValidator(),
        metaData: nonEmptyStringValidator(),
        meta_data: nonEmptyStringValidator(),
        callbackUrl: nonEmptyStringValidator(),
        callback_url: nonEmptyStringValidator(),
      },
    }
  }
  if (input.modality === 'video' && input.providerKey === 'openai-compatible') {
    return {
      allowedKeys: ['aspect_ratio', 'generationMode'],
      objectValidators: [openAiCompatibleVideoObjectValidator()],
      validators: { generateAudio: booleanValidator(), generationMode: nonEmptyStringValidator() },
    }
  }
  return {}
}
