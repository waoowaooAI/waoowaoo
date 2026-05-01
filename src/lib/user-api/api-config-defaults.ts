import { ApiError } from '@/lib/api-errors'
import { parseModelKeyStrict } from '@/lib/ai-registry/selection'
import type { PricingApiType } from '@/lib/ai-registry/pricing-catalog'
import {
  DEFAULT_ANALYSIS_WORKFLOW_CONCURRENCY,
  DEFAULT_IMAGE_WORKFLOW_CONCURRENCY,
  DEFAULT_VIDEO_WORKFLOW_CONCURRENCY,
  normalizeWorkflowConcurrencyValue,
} from '@/lib/workflow-concurrency'
import type { DefaultModelField, DefaultModelsPayload, StoredModel, WorkflowConcurrencyPayload } from './api-config-types'
import { DEFAULT_MODEL_FIELDS } from './api-config-types'
import { getProviderKey, isRecord, readTrimmedString } from './api-config-shared'
import { hasBuiltinPricingForModel } from './api-config-model-normalization'
import { hasCustomPricingForType } from './api-config-custom-pricing'

const DEFAULT_FIELD_TO_PRICING_API_TYPE: Readonly<Record<DefaultModelField, 'text' | 'image' | 'video' | 'voice' | 'music' | 'lip-sync'>> = {
  analysisModel: 'text',
  characterModel: 'image',
  locationModel: 'image',
  storyboardModel: 'image',
  editModel: 'image',
  videoModel: 'video',
  audioModel: 'voice',
  musicModel: 'music',
  lipSyncModel: 'lip-sync',
  voiceDesignModel: 'voice',
}

const BILLABLE_MODEL_TYPE_TO_PRICING_API_TYPE: Readonly<Record<StoredModel['type'], PricingApiType | null>> = {
  llm: 'text',
  image: 'image',
  video: 'video',
  audio: 'voice',
  music: 'music',
  lipsync: 'lip-sync',
}

const DEFAULT_FIELD_TO_MODEL_TYPE: Readonly<Record<DefaultModelField, StoredModel['type']>> = {
  analysisModel: 'llm',
  characterModel: 'image',
  locationModel: 'image',
  storyboardModel: 'image',
  editModel: 'image',
  videoModel: 'video',
  audioModel: 'audio',
  musicModel: 'music',
  lipSyncModel: 'lipsync',
  voiceDesignModel: 'audio',
}

const OPTIONAL_PRICING_PROVIDER_KEYS = new Set([
  'openai-compatible',
  'gemini-compatible',
  'bailian',
  'siliconflow',
])

function validateDefaultModelKey(field: DefaultModelField, value: unknown): string | null {
  // Contract anchor: default model key must be provider::modelId
  if (value === undefined) return null
  const modelKey = readTrimmedString(value)
  if (!modelKey) return null
  const parsed = parseModelKeyStrict(modelKey)
  if (!parsed) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_KEY_INVALID',
      field: `defaultModels.${field}`,
    })
  }
  return parsed.modelKey
}

export function normalizeDefaultModelsInput(rawDefaultModels: unknown): DefaultModelsPayload {
  if (rawDefaultModels === undefined) return {}
  if (!isRecord(rawDefaultModels)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'DEFAULT_MODELS_INVALID',
      field: 'defaultModels',
    })
  }

  const normalized: DefaultModelsPayload = {}
  for (const field of DEFAULT_MODEL_FIELDS) {
    if (rawDefaultModels[field] !== undefined) {
      normalized[field] = validateDefaultModelKey(field, rawDefaultModels[field]) || ''
    }
  }

  return normalized
}

export function normalizeWorkflowConcurrencyInput(rawWorkflowConcurrency: unknown): WorkflowConcurrencyPayload {
  if (rawWorkflowConcurrency === undefined) return {}
  if (!isRecord(rawWorkflowConcurrency)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'INVALID_PARAMS',
      field: 'workflowConcurrency',
    })
  }

  const normalized: WorkflowConcurrencyPayload = {}

  if (rawWorkflowConcurrency.analysis !== undefined) {
    const value = normalizeWorkflowConcurrencyValue(
      rawWorkflowConcurrency.analysis,
      DEFAULT_ANALYSIS_WORKFLOW_CONCURRENCY,
    )
    if (value !== rawWorkflowConcurrency.analysis) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'INVALID_PARAMS',
        field: 'workflowConcurrency.analysis',
      })
    }
    normalized.analysis = value
  }

  if (rawWorkflowConcurrency.image !== undefined) {
    const value = normalizeWorkflowConcurrencyValue(
      rawWorkflowConcurrency.image,
      DEFAULT_IMAGE_WORKFLOW_CONCURRENCY,
    )
    if (value !== rawWorkflowConcurrency.image) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'INVALID_PARAMS',
        field: 'workflowConcurrency.image',
      })
    }
    normalized.image = value
  }

  if (rawWorkflowConcurrency.video !== undefined) {
    const value = normalizeWorkflowConcurrencyValue(
      rawWorkflowConcurrency.video,
      DEFAULT_VIDEO_WORKFLOW_CONCURRENCY,
    )
    if (value !== rawWorkflowConcurrency.video) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'INVALID_PARAMS',
        field: 'workflowConcurrency.video',
      })
    }
    normalized.video = value
  }

  return normalized
}

export function validateDefaultModelPricing(defaultModels: DefaultModelsPayload) {
  for (const field of DEFAULT_MODEL_FIELDS) {
    const modelKey = defaultModels[field]
    if (!modelKey) continue

    const parsed = parseModelKeyStrict(modelKey)
    if (!parsed) continue
    if (OPTIONAL_PRICING_PROVIDER_KEYS.has(getProviderKey(parsed.provider))) continue
    const apiType = DEFAULT_FIELD_TO_PRICING_API_TYPE[field]
    if (apiType === 'music') continue

    if (!hasBuiltinPricingForModel(apiType, parsed.provider, parsed.modelId)) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'DEFAULT_MODEL_PRICING_NOT_CONFIGURED',
        field: `defaultModels.${field}`,
        modelKey: parsed.modelKey,
        apiType,
      })
    }
  }
}

function isModelPricedForBilling(model: StoredModel): boolean {
  const apiType = BILLABLE_MODEL_TYPE_TO_PRICING_API_TYPE[model.type]
  if (!apiType) return true
  if (apiType === 'music') return true
  if (hasCustomPricingForType(model)) return true
  if (OPTIONAL_PRICING_PROVIDER_KEYS.has(getProviderKey(model.provider))) return true
  return hasBuiltinPricingForModel(apiType, model.provider, model.modelId)
}

export function sanitizeModelsForBilling(models: StoredModel[]): StoredModel[] {
  return models.filter((model) => isModelPricedForBilling(model))
}

export function sanitizeDefaultModelsForBilling(defaultModels: DefaultModelsPayload): DefaultModelsPayload {
  const sanitized: DefaultModelsPayload = {}

  for (const field of DEFAULT_MODEL_FIELDS) {
    const rawModelKey = defaultModels[field]
    if (rawModelKey === undefined) continue
    const modelKey = readTrimmedString(rawModelKey)
    if (!modelKey) {
      sanitized[field] = ''
      continue
    }

    const parsed = parseModelKeyStrict(modelKey)
    if (!parsed) {
      sanitized[field] = ''
      continue
    }
    if (OPTIONAL_PRICING_PROVIDER_KEYS.has(getProviderKey(parsed.provider))) {
      sanitized[field] = parsed.modelKey
      continue
    }

    const apiType = DEFAULT_FIELD_TO_PRICING_API_TYPE[field]
    if (apiType === 'music') {
      sanitized[field] = parsed.modelKey
      continue
    }
    sanitized[field] = hasBuiltinPricingForModel(apiType, parsed.provider, parsed.modelId)
      ? parsed.modelKey
      : ''
  }

  return sanitized
}

function hasCandidateModelsForField(field: DefaultModelField, models: StoredModel[]): boolean {
  const expectedType = DEFAULT_FIELD_TO_MODEL_TYPE[field]
  return models.some((model) => model.type === expectedType)
}

function isEnabledDefaultModel(field: DefaultModelField, modelKey: string, models: StoredModel[]): boolean {
  const parsed = parseModelKeyStrict(modelKey)
  if (!parsed) return false
  const expectedType = DEFAULT_FIELD_TO_MODEL_TYPE[field]
  return models.some((model) => model.type === expectedType && model.modelKey === parsed.modelKey)
}

export function sanitizeDefaultModelsAgainstModels(
  defaultModels: DefaultModelsPayload,
  models: StoredModel[],
): DefaultModelsPayload {
  const sanitized: DefaultModelsPayload = {}

  for (const field of DEFAULT_MODEL_FIELDS) {
    const rawModelKey = defaultModels[field]
    if (rawModelKey === undefined) continue
    const modelKey = readTrimmedString(rawModelKey)
    if (!modelKey) {
      sanitized[field] = ''
      continue
    }
    if (!hasCandidateModelsForField(field, models)) {
      sanitized[field] = modelKey
      continue
    }
    sanitized[field] = isEnabledDefaultModel(field, modelKey, models) ? modelKey : ''
  }

  return sanitized
}

export function validateDefaultModelsAgainstModels(
  defaultModels: DefaultModelsPayload,
  models: StoredModel[],
) {
  for (const field of DEFAULT_MODEL_FIELDS) {
    const modelKey = readTrimmedString(defaultModels[field])
    if (!modelKey) continue
    if (!hasCandidateModelsForField(field, models)) continue
    if (isEnabledDefaultModel(field, modelKey, models)) continue

    throw new ApiError('INVALID_PARAMS', {
      code: 'DEFAULT_MODEL_NOT_ENABLED',
      field: `defaultModels.${field}`,
      modelKey,
      expectedType: DEFAULT_FIELD_TO_MODEL_TYPE[field],
    })
  }
}
