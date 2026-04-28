import { ApiError } from '@/lib/api-errors'
import { parseModelKeyStrict } from '@/lib/ai-registry/selection'
import { getCapabilityOptionFields, resolveBuiltinModelContext, validateCapabilitySelectionsPayload } from '@/lib/ai-registry/capabilities-catalog'
import type { CapabilitySelections } from '@/lib/ai-registry/types'
import type { StoredModel } from './api-config-types'
import { CAPABILITY_MODEL_TYPES } from './api-config-types'
import { isRecord } from './api-config-shared'

export function normalizeCapabilitySelectionsInput(
  raw: unknown,
  options?: { allowLegacyAspectRatio?: boolean },
): CapabilitySelections {
  if (raw === undefined || raw === null) return {}
  if (!isRecord(raw)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'CAPABILITY_SELECTION_INVALID',
      field: 'capabilityDefaults',
    })
  }

  const normalized: CapabilitySelections = {}
  for (const [modelKey, rawSelection] of Object.entries(raw)) {
    if (!isRecord(rawSelection)) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'CAPABILITY_SELECTION_INVALID',
        field: `capabilityDefaults.${modelKey}`,
      })
    }

    const selection: Record<string, string | number | boolean> = {}
    for (const [field, value] of Object.entries(rawSelection)) {
      if (field === 'aspectRatio') {
        if (options?.allowLegacyAspectRatio) continue
        throw new ApiError('INVALID_PARAMS', {
          code: 'CAPABILITY_FIELD_INVALID',
          field: `capabilityDefaults.${modelKey}.${field}`,
        })
      }
      if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
        throw new ApiError('INVALID_PARAMS', {
          code: 'CAPABILITY_SELECTION_INVALID',
          field: `capabilityDefaults.${modelKey}.${field}`,
        })
      }
      selection[field] = value
    }

    if (Object.keys(selection).length > 0) {
      normalized[modelKey] = selection
    }
  }

  return normalized
}

export function parseStoredCapabilitySelections(raw: string | null | undefined, field: string): CapabilitySelections {
  if (!raw) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ApiError('INVALID_PARAMS', {
      code: 'CAPABILITY_SELECTION_INVALID',
      field,
    })
  }

  return normalizeCapabilitySelectionsInput(parsed, { allowLegacyAspectRatio: true })
}

export function serializeCapabilitySelections(selections: CapabilitySelections): string | null {
  if (Object.keys(selections).length === 0) return null
  return JSON.stringify(selections)
}

function buildStoredModelMap(models: StoredModel[]): Map<string, StoredModel> {
  const modelMap = new Map<string, StoredModel>()
  for (const model of models) {
    modelMap.set(model.modelKey, model)
  }
  return modelMap
}

function resolveCapabilityContextForModelKey(
  modelMap: Map<string, StoredModel>,
  modelKey: string,
) {
  const model = modelMap.get(modelKey)
  if (model) {
    return resolveBuiltinModelContext(model.type, model.modelKey) || null
  }

  if (!parseModelKeyStrict(modelKey)) return null
  for (const modelType of CAPABILITY_MODEL_TYPES) {
    const context = resolveBuiltinModelContext(modelType, modelKey)
    if (context) return context
  }
  return null
}

export function sanitizeCapabilitySelectionsAgainstModels(
  selections: CapabilitySelections,
  models: StoredModel[],
): CapabilitySelections {
  const modelMap = buildStoredModelMap(models)
  const sanitized: CapabilitySelections = {}

  for (const [modelKey, selection] of Object.entries(selections)) {
    const context = resolveCapabilityContextForModelKey(modelMap, modelKey)
    if (!context) continue

    const optionFields = getCapabilityOptionFields(context.modelType, context.capabilities)
    if (Object.keys(optionFields).length === 0) continue

    const cleanedSelection: Record<string, string | number | boolean> = {}
    for (const [field, value] of Object.entries(selection)) {
      const allowedValues = optionFields[field]
      if (!allowedValues) continue
      if (!allowedValues.includes(value)) continue
      cleanedSelection[field] = value
    }

    if (Object.keys(cleanedSelection).length > 0) {
      sanitized[modelKey] = cleanedSelection
    }
  }

  return sanitized
}

export function validateCapabilitySelectionsAgainstModels(
  selections: CapabilitySelections,
  models: StoredModel[],
) {
  const modelMap = buildStoredModelMap(models)
  const issues = validateCapabilitySelectionsPayload(
    selections,
    (modelKey) => resolveCapabilityContextForModelKey(modelMap, modelKey),
  )

  if (issues.length > 0) {
    const firstIssue = issues[0]
    throw new ApiError('INVALID_PARAMS', {
      code: firstIssue.code,
      field: firstIssue.field,
      allowedValues: firstIssue.allowedValues,
    })
  }
}
