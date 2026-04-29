import type {
  AiOptionObjectValidator,
  AiOptionSchema,
  AiOptionValidationResult,
  AiOptionValidator,
} from '@/lib/ai-registry/types'

export type MediaModality = 'image' | 'video' | 'audio'

export type ResolutionDurationRule = { resolution: string; durations: readonly number[] }

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

export function enumValidator(values: readonly string[]): AiOptionValidator {
  const allowedValues = new Set(values)
  return (value) => {
    if (value === undefined) return { ok: true }
    if (typeof value !== 'string') return { ok: false, reason: 'expected_string' }
    return allowedValues.has(value)
      ? { ok: true }
      : { ok: false, reason: `unsupported_value=${value}` }
  }
}

export function integerRangeValidator(input: { min?: number; max?: number }): AiOptionValidator {
  return (value) => {
    if (value === undefined) return { ok: true }
    if (typeof value !== 'number' || !Number.isInteger(value)) return { ok: false, reason: 'expected_integer' }
    if (input.min !== undefined && value < input.min) return { ok: false, reason: `min=${input.min}` }
    if (input.max !== undefined && value > input.max) return { ok: false, reason: `max=${input.max}` }
    return { ok: true }
  }
}

export function booleanValidator(): AiOptionValidator {
  return (value) => {
    if (value === undefined) return { ok: true }
    return typeof value === 'boolean' ? { ok: true } : { ok: false, reason: 'expected_boolean' }
  }
}

export function nonEmptyStringValidator(): AiOptionValidator {
  return (value) => {
    if (value === undefined) return { ok: true }
    return typeof value === 'string' && value.trim().length > 0
      ? { ok: true }
      : { ok: false, reason: 'expected_non_empty_string' }
  }
}

function passthroughValidator(): AiOptionValidationResult {
  return { ok: true }
}

export function buildMediaOptionSchema(
  modality: MediaModality,
  override?: {
    allowedKeys?: readonly string[]
    required?: readonly string[]
    requiresOneOf?: AiOptionSchema['requiresOneOf']
    conflicts?: AiOptionSchema['conflicts']
    validators?: Readonly<Record<string, AiOptionValidator>>
    objectValidators?: readonly AiOptionObjectValidator[]
  },
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

function pickFirstDefined(options: { readonly [key: string]: unknown }, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (options[key] !== undefined) return options[key]
  }
  return undefined
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
    : { ok: false, reason: `duration=${duration}_for_${input.modelId}` }
}

export function createMinimaxVideoObjectValidator(input: {
  modelId: string
  specs: Record<string, {
    supportsFirstLastFrame: boolean
    normalRules: readonly ResolutionDurationRule[]
    firstLastFrameRules?: readonly ResolutionDurationRule[]
  }>
}): AiOptionObjectValidator {
  return (options) => {
    const spec = input.specs[input.modelId]
    if (!spec) return { ok: false, reason: `modelId=${input.modelId}` }
    const rawMode = options.generationMode
    if (rawMode !== undefined && rawMode !== 'normal' && rawMode !== 'firstlastframe') {
      return { ok: false, reason: `generationMode=${String(rawMode)}` }
    }
    const hasLastFrame = typeof options.lastFrameImageUrl === 'string' && options.lastFrameImageUrl.trim().length > 0
    const inferredMode = hasLastFrame ? 'firstlastframe' : 'normal'
    const mode = rawMode === undefined ? inferredMode : rawMode
    if (mode !== inferredMode) return { ok: false, reason: `generationMode=${String(rawMode)}` }
    if (mode === 'firstlastframe' && !spec.supportsFirstLastFrame) return { ok: false, reason: `generationMode=firstlastframe_for_${input.modelId}` }
    const rawResolution = options.resolution
    let resolution: string | undefined
    if (rawResolution !== undefined) {
      if (typeof rawResolution !== 'string') return { ok: false, reason: 'resolution=expected_string' }
      const normalized = rawResolution.trim().toLowerCase()
      if (normalized.includes('512')) resolution = '512P'
      else if (normalized.includes('768')) resolution = '768P'
      else if (normalized.includes('720')) resolution = '720P'
      else if (normalized.includes('1080')) resolution = '1080P'
      else return { ok: false, reason: `resolution=${rawResolution}` }
    }
    const rawDuration = options.duration
    if (rawDuration !== undefined && (typeof rawDuration !== 'number' || !Number.isInteger(rawDuration))) return { ok: false, reason: 'duration=expected_integer' }
    const rules = mode === 'firstlastframe' ? (spec.firstLastFrameRules || []) : spec.normalRules
    const rulesResult = validateResolutionDuration({ modelId: input.modelId, rules, resolution, duration: rawDuration as number | undefined })
    if (!rulesResult.ok) return rulesResult
    if (options.generateAudio === true) return { ok: false, reason: `generateAudio_for_${input.modelId}` }
    if (options.generateAudio !== undefined && typeof options.generateAudio !== 'boolean') return { ok: false, reason: `generateAudio=${String(options.generateAudio)}` }
    return { ok: true }
  }
}

function isViduRatioAllowed(input: {
  profile: ViduSpec['aspectRatioProfile']
  ratio: string
  standardRatios: ReadonlySet<string>
  extraRatios: ReadonlySet<string>
  ratioPattern: RegExp
}) {
  if (input.standardRatios.has(input.ratio)) return true
  if (input.profile !== 'q2-flex') return false
  if (input.extraRatios.has(input.ratio)) return true
  const match = input.ratio.match(input.ratioPattern)
  if (!match) return false
  const width = Number(match[1])
  const height = Number(match[2])
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0
}

export function createViduVideoObjectValidator(input: {
  modelId: string
  specs: Record<string, ViduSpec>
  standardRatios: ReadonlySet<string>
  extraRatios: ReadonlySet<string>
  ratioPattern: RegExp
  audioTypes: ReadonlySet<string>
  movementAmplitudes: ReadonlySet<string>
  maxPayloadLength: number
}): AiOptionObjectValidator {
  return (options) => {
    const spec = input.specs[input.modelId]
    if (!spec) return { ok: false, reason: `modelId=${input.modelId}` }
    const lastFrame = options.lastFrameImageUrl
    if (lastFrame !== undefined && (typeof lastFrame !== 'string' || lastFrame.trim().length === 0)) return { ok: false, reason: 'lastFrameImageUrl=expected_non_empty_string' }
    const inferredMode = typeof lastFrame === 'string' && lastFrame.trim().length > 0 ? 'firstlastframe' : 'normal'
    const rawMode = options.generationMode
    if (rawMode !== undefined && rawMode !== 'normal' && rawMode !== 'firstlastframe') return { ok: false, reason: `generationMode=${String(rawMode)}` }
    const mode = rawMode === undefined ? inferredMode : rawMode
    if (mode !== inferredMode) return { ok: false, reason: `generationMode=${String(rawMode)}` }
    if (mode === 'firstlastframe' && !spec.supportsFirstLastFrame) return { ok: false, reason: `firstlastframe_for_${input.modelId}` }
    const modeSpec = mode === 'firstlastframe' ? spec.firstLast : spec.normal
    if (!modeSpec) return { ok: false, reason: `firstlastframe_for_${input.modelId}` }
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
      if (!isViduRatioAllowed({
        profile: spec.aspectRatioProfile,
        ratio: rawRatio.trim(),
        standardRatios: input.standardRatios,
        extraRatios: input.extraRatios,
        ratioPattern: input.ratioPattern,
      })) return { ok: false, reason: `aspectRatio=${rawRatio.trim()}` }
    }
    const rawGenerateAudio = pickFirstDefined(options, ['generateAudio', 'audio'])
    if (rawGenerateAudio !== undefined && typeof rawGenerateAudio !== 'boolean') return { ok: false, reason: 'generateAudio=expected_boolean' }
    const generateAudio = rawGenerateAudio === true
    if (generateAudio && !spec.supportsGenerateAudio) return { ok: false, reason: `generateAudio_for_${input.modelId}` }
    const audioType = pickFirstDefined(options, ['audioType', 'audio_type'])
    if (audioType !== undefined) {
      if (typeof audioType !== 'string' || audioType.trim().length === 0) return { ok: false, reason: 'audioType=expected_non_empty_string' }
      if (!input.audioTypes.has(audioType.trim())) return { ok: false, reason: `audioType=${audioType}` }
      if (!generateAudio) return { ok: false, reason: 'audioType_requires_generateAudio' }
    }
    const movementAmplitude = pickFirstDefined(options, ['movementAmplitude', 'movement_amplitude'])
    if (movementAmplitude !== undefined) {
      if (typeof movementAmplitude !== 'string' || movementAmplitude.trim().length === 0) return { ok: false, reason: 'movementAmplitude=expected_non_empty_string' }
      if (!input.movementAmplitudes.has(movementAmplitude.trim())) return { ok: false, reason: `movementAmplitude=${movementAmplitude}` }
    }
    const payload = options.payload
    if (payload !== undefined) {
      if (typeof payload !== 'string' || payload.trim().length === 0) return { ok: false, reason: 'payload=expected_non_empty_string' }
      if (payload.length > input.maxPayloadLength) return { ok: false, reason: `payload_length>${input.maxPayloadLength}` }
    }
    const wmPosition = pickFirstDefined(options, ['wmPosition', 'wm_position'])
    if (wmPosition !== undefined) {
      if (typeof wmPosition !== 'number' || !Number.isInteger(wmPosition)) return { ok: false, reason: 'wmPosition=expected_integer' }
      if (wmPosition < 1 || wmPosition > 4) return { ok: false, reason: `wmPosition=${wmPosition}` }
    }
    return { ok: true }
  }
}

export function createFalVideoObjectValidator(modelId: string, modelIds: ReadonlySet<string>): AiOptionObjectValidator {
  return () => modelIds.has(modelId) ? { ok: true } : { ok: false, reason: `modelId=${modelId}` }
}

export function createOpenAiCompatibleVideoObjectValidator(input: {
  durations: readonly string[]
  ratios: ReadonlySet<string>
  sizes: ReadonlySet<string>
}): AiOptionObjectValidator {
  return (options) => {
    const duration = options.duration
    if (duration !== undefined && duration !== 4 && duration !== 8 && duration !== 12 && !input.durations.includes(String(duration))) {
      return { ok: false, reason: `duration=${String(duration)}` }
    }
    const aspectRatio = pickFirstDefined(options, ['aspectRatio', 'aspect_ratio'])
    if (aspectRatio !== undefined && (typeof aspectRatio !== 'string' || !input.ratios.has(aspectRatio.trim()))) {
      return { ok: false, reason: `aspectRatio=${String(aspectRatio)}` }
    }
    const rawSize = options.size
    const rawResolution = options.resolution
    for (const [key, value] of [['size', rawSize], ['resolution', rawResolution]] as const) {
      if (value !== undefined && (typeof value !== 'string' || !input.sizes.has(value.trim()))) {
        return { ok: false, reason: `${key}=${String(value)}` }
      }
    }
    if (typeof rawSize === 'string' && typeof rawResolution === 'string' && rawSize.trim() !== rawResolution.trim()) {
      return { ok: false, reason: 'size_and_resolution_must_match' }
    }
    return { ok: true }
  }
}
