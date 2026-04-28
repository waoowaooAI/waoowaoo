import type OpenAI from 'openai'

export type AiModality = 'llm' | 'vision' | 'image' | 'video' | 'audio' | 'lipsync'
export type AiExecutionMode = 'sync' | 'async' | 'stream' | 'batch'
export type AiVariantSubKind = 'official' | 'user-template'

export type AiOptionValidationResult =
  | { ok: true }
  | { ok: false; reason: string }

export type AiOptionValidator = (value: unknown) => AiOptionValidationResult
export type AiOptionObjectValidator = (options: Readonly<Record<string, unknown>>) => AiOptionValidationResult

export type AiOptionSchema = {
  allowedKeys: ReadonlySet<string>
  required?: readonly string[]
  requiresOneOf?: ReadonlyArray<{ keys: readonly string[]; message: string }>
  conflicts?: ReadonlyArray<{ keys: readonly string[]; message: string; allowSameValue?: boolean }>
  validators: Readonly<Record<string, AiOptionValidator>>
  objectValidators?: readonly AiOptionObjectValidator[]
}

export type AiVariantDescriptor = {
  modelKey: string
  providerKey: string
  providerId: string
  modelId: string
  modality: AiModality

  familyRef?: string

  display: {
    name: string
    sourceLabel: string
    label: string
  }

  execution: {
    mode: AiExecutionMode
    externalIdPrefix?: string
  }

  capabilities: Record<string, unknown>
  optionSchema: AiOptionSchema
  inputContracts?: Record<string, unknown>
}

export type AiResolvedSelection = {
  provider: string
  modelId: string
  modelKey: string
  variantSubKind: AiVariantSubKind
  variantData?: Record<string, unknown>
}

export type AiResolvedLlmSelection = AiResolvedSelection & {
  llmProtocol?: 'responses' | 'chat-completions'
}

export type AiLlmMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export type AiLlmProviderConfig = {
  id: string
  name: string
  apiKey: string
  baseUrl?: string
  apiMode?: 'gemini-sdk' | 'openai-official'
  gatewayRoute?: 'official' | 'openai-compat'
}

export type AiLlmExecutionInput = {
  userId: string
  providerKey: string
  selection: AiResolvedLlmSelection
  providerConfig: AiLlmProviderConfig
  messages: AiLlmMessage[]
  temperature: number
  reasoning: boolean
  reasoningEffort: 'minimal' | 'low' | 'medium' | 'high'
  maxRetries: number
}

export type AiLlmUsage = {
  promptTokens: number
  completionTokens: number
}

export type AiLlmExecutionResult = {
  completion: OpenAI.Chat.Completions.ChatCompletion
  logProvider: string
  text: string
  reasoning: string
  usage?: AiLlmUsage | null
  successDetails?: Record<string, unknown>
}

export type UnifiedModelType = 'llm' | 'image' | 'video' | 'audio' | 'lipsync'
export type CapabilityValue = string | number | boolean
export type CapabilityOptionValue = CapabilityValue
export type CapabilitySelections = Record<string, Record<string, CapabilityValue>>

export type CapabilityValidationCode =
  | 'CAPABILITY_SHAPE_INVALID'
  | 'CAPABILITY_NAMESPACE_INVALID'
  | 'CAPABILITY_FIELD_INVALID'
  | 'CAPABILITY_VALUE_NOT_ALLOWED'

export interface CapabilityValidationIssue {
  code: CapabilityValidationCode
  field: string
  message: string
  allowedValues?: readonly CapabilityOptionValue[]
}

export interface CapabilityFieldI18n {
  labelKey?: string
  unitKey?: string
  optionLabelKeys?: Record<string, string>
}

export type CapabilityFieldI18nMap = Record<string, CapabilityFieldI18n>

export interface LLMCapabilities {
  reasoningEffortOptions?: string[]
  fieldI18n?: CapabilityFieldI18nMap
}

export interface ImageCapabilities {
  resolutionOptions?: string[]
  fieldI18n?: CapabilityFieldI18nMap
}

export interface VideoCapabilities {
  generationModeOptions?: string[]
  generateAudioOptions?: boolean[]
  durationOptions?: number[]
  fpsOptions?: number[]
  resolutionOptions?: string[]
  firstlastframe?: boolean
  supportGenerateAudio?: boolean
  fieldI18n?: CapabilityFieldI18nMap
}

export interface AudioCapabilities {
  voiceOptions?: string[]
  rateOptions?: string[]
  fieldI18n?: CapabilityFieldI18nMap
}

export interface LipSyncCapabilities {
  modeOptions?: string[]
  fieldI18n?: CapabilityFieldI18nMap
}

export interface ModelCapabilities {
  llm?: LLMCapabilities
  image?: ImageCapabilities
  video?: VideoCapabilities
  audio?: AudioCapabilities
  lipsync?: LipSyncCapabilities
}

const CAPABILITY_NAMESPACES = new Set<keyof ModelCapabilities>([
  'llm',
  'image',
  'video',
  'audio',
  'lipsync',
])

const LLM_ALLOWED_FIELDS = new Set<keyof LLMCapabilities>([
  'reasoningEffortOptions',
  'fieldI18n',
])

const IMAGE_ALLOWED_FIELDS = new Set<keyof ImageCapabilities>([
  'resolutionOptions',
  'fieldI18n',
])

const VIDEO_ALLOWED_FIELDS = new Set<keyof VideoCapabilities>([
  'generationModeOptions',
  'generateAudioOptions',
  'durationOptions',
  'fpsOptions',
  'resolutionOptions',
  'firstlastframe',
  'supportGenerateAudio',
  'fieldI18n',
])

const AUDIO_ALLOWED_FIELDS = new Set<keyof AudioCapabilities>([
  'voiceOptions',
  'rateOptions',
  'fieldI18n',
])

const LIPSYNC_ALLOWED_FIELDS = new Set<keyof LipSyncCapabilities>([
  'modeOptions',
  'fieldI18n',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim().length > 0)
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isFinite(item))
}

function isBooleanArray(value: unknown): value is boolean[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'boolean')
}

function makeAllowedIssue(
  field: string,
  value: unknown,
  allowedValues: readonly CapabilityOptionValue[],
): CapabilityValidationIssue {
  return {
    code: 'CAPABILITY_VALUE_NOT_ALLOWED',
    field,
    allowedValues,
    message: `Value ${String(value)} is not allowed`,
  }
}

function validateFieldI18nMap(
  issues: CapabilityValidationIssue[],
  namespace: keyof ModelCapabilities,
  rawFieldI18n: unknown,
  allowedFields: Readonly<Record<string, readonly CapabilityOptionValue[] | undefined>>,
) {
  if (rawFieldI18n === undefined) return
  if (!isRecord(rawFieldI18n)) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: `capabilities.${namespace}.fieldI18n`,
      message: 'fieldI18n must be an object',
    })
    return
  }

  for (const [field, rawConfig] of Object.entries(rawFieldI18n)) {
    if (!(field in allowedFields)) {
      issues.push({
        code: 'CAPABILITY_FIELD_INVALID',
        field: `capabilities.${namespace}.fieldI18n.${field}`,
        message: `Unknown i18n field: ${field}`,
      })
      continue
    }

    if (!isRecord(rawConfig)) {
      issues.push({
        code: 'CAPABILITY_FIELD_INVALID',
        field: `capabilities.${namespace}.fieldI18n.${field}`,
        message: 'field i18n config must be an object',
      })
      continue
    }

    if (rawConfig.labelKey !== undefined && !isNonEmptyString(rawConfig.labelKey)) {
      issues.push({
        code: 'CAPABILITY_FIELD_INVALID',
        field: `capabilities.${namespace}.fieldI18n.${field}.labelKey`,
        message: 'labelKey must be a non-empty string',
      })
    }

    if (rawConfig.unitKey !== undefined && !isNonEmptyString(rawConfig.unitKey)) {
      issues.push({
        code: 'CAPABILITY_FIELD_INVALID',
        field: `capabilities.${namespace}.fieldI18n.${field}.unitKey`,
        message: 'unitKey must be a non-empty string',
      })
    }

    if (rawConfig.optionLabelKeys !== undefined) {
      if (!isRecord(rawConfig.optionLabelKeys)) {
        issues.push({
          code: 'CAPABILITY_FIELD_INVALID',
          field: `capabilities.${namespace}.fieldI18n.${field}.optionLabelKeys`,
          message: 'optionLabelKeys must be an object',
        })
        continue
      }

      const allowedOptionKeys = new Set((allowedFields[field] || []).map((value) => String(value)))
      for (const [optionKey, optionLabel] of Object.entries(rawConfig.optionLabelKeys)) {
        if (!isNonEmptyString(optionLabel)) {
          issues.push({
            code: 'CAPABILITY_FIELD_INVALID',
            field: `capabilities.${namespace}.fieldI18n.${field}.optionLabelKeys.${optionKey}`,
            message: 'option label must be a non-empty string',
          })
        }
        if (allowedOptionKeys.size > 0 && !allowedOptionKeys.has(optionKey)) {
          issues.push({
            code: 'CAPABILITY_VALUE_NOT_ALLOWED',
            field: `capabilities.${namespace}.fieldI18n.${field}.optionLabelKeys.${optionKey}`,
            message: `Option key ${optionKey} is not defined in ${field}Options`,
            allowedValues: Array.from(allowedOptionKeys),
          })
        }
      }
    }
  }
}

function validateNamespaceShape(
  issues: CapabilityValidationIssue[],
  namespace: keyof ModelCapabilities,
  value: unknown,
) {
  if (value === undefined) return
  if (!isRecord(value)) {
    issues.push({
      code: 'CAPABILITY_SHAPE_INVALID',
      field: `capabilities.${namespace}`,
      message: `capabilities.${namespace} must be an object`,
    })
  }
}

function validateNamespaceAllowedFields(
  issues: CapabilityValidationIssue[],
  namespace: keyof ModelCapabilities,
  value: unknown,
  allowedFields: ReadonlySet<string>,
) {
  if (!isRecord(value)) return
  for (const field of Object.keys(value)) {
    if (allowedFields.has(field)) continue
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: `capabilities.${namespace}.${field}`,
      message: field === 'i18n'
        ? 'Use fieldI18n instead of i18n'
        : `Unknown capability field: ${field}`,
    })
  }
}

function validateLLMCapabilities(issues: CapabilityValidationIssue[], raw: unknown) {
  if (!isRecord(raw)) return
  const options = raw.reasoningEffortOptions
  if (options !== undefined && !isStringArray(options)) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.llm.reasoningEffortOptions',
      message: 'reasoningEffortOptions must be a non-empty string array',
    })
  }

  validateFieldI18nMap(issues, 'llm', raw.fieldI18n, {
    reasoningEffort: isStringArray(options) ? options : undefined,
  })
}

function validateImageCapabilities(issues: CapabilityValidationIssue[], raw: unknown) {
  if (!isRecord(raw)) return

  const resolutionOptions = raw.resolutionOptions
  if (resolutionOptions !== undefined && !isStringArray(resolutionOptions)) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.image.resolutionOptions',
      message: 'resolutionOptions must be a non-empty string array',
    })
  }

  validateFieldI18nMap(issues, 'image', raw.fieldI18n, {
    resolution: isStringArray(resolutionOptions) ? resolutionOptions : undefined,
  })
}

function validateVideoCapabilities(issues: CapabilityValidationIssue[], raw: unknown) {
  if (!isRecord(raw)) return

  const generationModeOptions = raw.generationModeOptions
  if (generationModeOptions !== undefined && !isStringArray(generationModeOptions)) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.video.generationModeOptions',
      message: 'generationModeOptions must be a non-empty string array',
    })
  }

  const generateAudioOptions = raw.generateAudioOptions
  if (generateAudioOptions !== undefined && !isBooleanArray(generateAudioOptions)) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.video.generateAudioOptions',
      message: 'generateAudioOptions must be a boolean array',
    })
  }

  const durationOptions = raw.durationOptions
  if (durationOptions !== undefined && !isNumberArray(durationOptions)) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.video.durationOptions',
      message: 'durationOptions must be a finite number array',
    })
  }

  const fpsOptions = raw.fpsOptions
  if (fpsOptions !== undefined && !isNumberArray(fpsOptions)) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.video.fpsOptions',
      message: 'fpsOptions must be a finite number array',
    })
  }

  const resolutionOptions = raw.resolutionOptions
  if (resolutionOptions !== undefined && !isStringArray(resolutionOptions)) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.video.resolutionOptions',
      message: 'resolutionOptions must be a non-empty string array',
    })
  }

  if (raw.supportGenerateAudio !== undefined && typeof raw.supportGenerateAudio !== 'boolean') {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.video.supportGenerateAudio',
      message: 'supportGenerateAudio must be boolean',
    })
  }

  if (raw.firstlastframe !== undefined && typeof raw.firstlastframe !== 'boolean') {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.video.firstlastframe',
      message: 'firstlastframe must be boolean',
    })
  }

  validateFieldI18nMap(issues, 'video', raw.fieldI18n, {
    generationMode: isStringArray(generationModeOptions) ? generationModeOptions : undefined,
    generateAudio: isBooleanArray(generateAudioOptions) ? generateAudioOptions : undefined,
    duration: isNumberArray(durationOptions) ? durationOptions : undefined,
    fps: isNumberArray(fpsOptions) ? fpsOptions : undefined,
    resolution: isStringArray(resolutionOptions) ? resolutionOptions : undefined,
  })
}

function validateAudioCapabilities(issues: CapabilityValidationIssue[], raw: unknown) {
  if (!isRecord(raw)) return

  const voiceOptions = raw.voiceOptions
  if (voiceOptions !== undefined && !isStringArray(voiceOptions)) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.audio.voiceOptions',
      message: 'voiceOptions must be a non-empty string array',
    })
  }

  const rateOptions = raw.rateOptions
  if (rateOptions !== undefined && !isStringArray(rateOptions)) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.audio.rateOptions',
      message: 'rateOptions must be a non-empty string array',
    })
  }

  validateFieldI18nMap(issues, 'audio', raw.fieldI18n, {
    voice: isStringArray(voiceOptions) ? voiceOptions : undefined,
    rate: isStringArray(rateOptions) ? rateOptions : undefined,
  })
}

function validateLipSyncCapabilities(issues: CapabilityValidationIssue[], raw: unknown) {
  if (!isRecord(raw)) return
  const modeOptions = raw.modeOptions
  if (modeOptions !== undefined && !isStringArray(modeOptions)) {
    issues.push({
      code: 'CAPABILITY_FIELD_INVALID',
      field: 'capabilities.lipsync.modeOptions',
      message: 'modeOptions must be a non-empty string array',
    })
  }

  validateFieldI18nMap(issues, 'lipsync', raw.fieldI18n, {
    mode: isStringArray(modeOptions) ? modeOptions : undefined,
  })
}

function validateOptionFieldValue(
  fieldPath: string,
  value: unknown,
  allowedValues: readonly CapabilityOptionValue[],
): CapabilityValidationIssue | null {
  if (!allowedValues.includes(value as CapabilityOptionValue)) {
    return makeAllowedIssue(fieldPath, value, allowedValues)
  }
  return null
}

export function validateOptionValueAgainstAllowed(
  fieldPath: string,
  value: unknown,
  allowedValues: readonly CapabilityOptionValue[],
): CapabilityValidationIssue[] {
  const issue = validateOptionFieldValue(fieldPath, value, allowedValues)
  return issue ? [issue] : []
}

export function validateModelCapabilities(
  modelType: UnifiedModelType,
  capabilities: unknown,
): CapabilityValidationIssue[] {
  const issues: CapabilityValidationIssue[] = []
  const expectedNamespace: keyof ModelCapabilities = modelType

  if (capabilities === undefined || capabilities === null) return issues
  if (!isRecord(capabilities)) {
    issues.push({
      code: 'CAPABILITY_SHAPE_INVALID',
      field: 'capabilities',
      message: 'capabilities must be an object',
    })
    return issues
  }

  for (const namespace of Object.keys(capabilities)) {
    if (!CAPABILITY_NAMESPACES.has(namespace as keyof ModelCapabilities)) {
      issues.push({
        code: 'CAPABILITY_NAMESPACE_INVALID',
        field: `capabilities.${namespace}`,
        message: `Unknown capabilities namespace: ${namespace}`,
      })
      continue
    }

    if (namespace !== expectedNamespace) {
      issues.push({
        code: 'CAPABILITY_NAMESPACE_INVALID',
        field: `capabilities.${namespace}`,
        allowedValues: [expectedNamespace],
        message: `Namespace ${namespace} is not allowed for model type ${modelType}`,
      })
    }
  }

  validateNamespaceShape(issues, 'llm', (capabilities as ModelCapabilities).llm)
  validateNamespaceShape(issues, 'image', (capabilities as ModelCapabilities).image)
  validateNamespaceShape(issues, 'video', (capabilities as ModelCapabilities).video)
  validateNamespaceShape(issues, 'audio', (capabilities as ModelCapabilities).audio)
  validateNamespaceShape(issues, 'lipsync', (capabilities as ModelCapabilities).lipsync)

  validateNamespaceAllowedFields(issues, 'llm', (capabilities as ModelCapabilities).llm, LLM_ALLOWED_FIELDS)
  validateNamespaceAllowedFields(issues, 'image', (capabilities as ModelCapabilities).image, IMAGE_ALLOWED_FIELDS)
  validateNamespaceAllowedFields(issues, 'video', (capabilities as ModelCapabilities).video, VIDEO_ALLOWED_FIELDS)
  validateNamespaceAllowedFields(issues, 'audio', (capabilities as ModelCapabilities).audio, AUDIO_ALLOWED_FIELDS)
  validateNamespaceAllowedFields(issues, 'lipsync', (capabilities as ModelCapabilities).lipsync, LIPSYNC_ALLOWED_FIELDS)

  validateLLMCapabilities(issues, (capabilities as ModelCapabilities).llm)
  validateImageCapabilities(issues, (capabilities as ModelCapabilities).image)
  validateVideoCapabilities(issues, (capabilities as ModelCapabilities).video)
  validateAudioCapabilities(issues, (capabilities as ModelCapabilities).audio)
  validateLipSyncCapabilities(issues, (capabilities as ModelCapabilities).lipsync)

  return issues
}
