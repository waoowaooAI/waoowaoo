import { ApiError } from '@/lib/api-errors'
import type { StoredModel, StoredModelCustomPricing, StoredModelMediaCustomPricing } from './api-config-types'
import { isRecord } from './api-config-shared'

function readNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined
  }
  return value
}

function parseNonNegativeNumberStrict(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined
  const parsed = readNonNegativeNumber(value)
  if (parsed !== undefined) return parsed
  throw new ApiError('INVALID_PARAMS', {
    code: 'MODEL_CUSTOM_PRICING_INVALID',
    field,
  })
}

function validateAllowedObjectKeys(
  raw: Record<string, unknown>,
  allowed: readonly string[],
  field: string,
) {
  const allowedSet = new Set(allowed)
  for (const key of Object.keys(raw)) {
    if (allowedSet.has(key)) continue
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_CUSTOM_PRICING_INVALID',
      field: `${field}.${key}`,
    })
  }
}

function normalizeOptionPrices(
  raw: unknown,
  options?: { strict?: boolean; field?: string },
): Record<string, Record<string, number>> | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!isRecord(raw)) {
    if (options?.strict) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'MODEL_CUSTOM_PRICING_INVALID',
        field: options.field || 'models.customPricing.optionPrices',
      })
    }
    return undefined
  }

  const normalized: Record<string, Record<string, number>> = {}
  for (const [field, rawFieldPricing] of Object.entries(raw)) {
    if (!isRecord(rawFieldPricing)) {
      if (options?.strict) {
        throw new ApiError('INVALID_PARAMS', {
          code: 'MODEL_CUSTOM_PRICING_INVALID',
          field: options.field ? `${options.field}.${field}` : `models.customPricing.optionPrices.${field}`,
        })
      }
      continue
    }
    const fieldPricing: Record<string, number> = {}
    for (const [optionValue, rawAmount] of Object.entries(rawFieldPricing)) {
      const amount = options?.strict
        ? parseNonNegativeNumberStrict(
          rawAmount,
          options.field
            ? `${options.field}.${field}.${optionValue}`
            : `models.customPricing.optionPrices.${field}.${optionValue}`,
        )
        : readNonNegativeNumber(rawAmount)
      if (amount === undefined) continue
      fieldPricing[optionValue] = amount
    }
    if (Object.keys(fieldPricing).length > 0) {
      normalized[field] = fieldPricing
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined
}

function normalizeMediaCustomPricing(
  raw: unknown,
  options?: { strict?: boolean; field?: string },
): StoredModelMediaCustomPricing | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!isRecord(raw)) {
    if (options?.strict) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'MODEL_CUSTOM_PRICING_INVALID',
        field: options.field || 'models.customPricing',
      })
    }
    return undefined
  }
  if (options?.strict) {
    validateAllowedObjectKeys(raw, ['basePrice', 'optionPrices'], options.field || 'models.customPricing')
  }
  const basePrice = options?.strict
    ? parseNonNegativeNumberStrict(raw.basePrice, options.field ? `${options.field}.basePrice` : 'models.customPricing.basePrice')
    : readNonNegativeNumber(raw.basePrice)
  const optionPrices = normalizeOptionPrices(raw.optionPrices, {
    strict: options?.strict,
    field: options?.field ? `${options.field}.optionPrices` : 'models.customPricing.optionPrices',
  })
  if (basePrice === undefined && optionPrices === undefined) return undefined

  return {
    ...(basePrice !== undefined ? { basePrice } : {}),
    ...(optionPrices ? { optionPrices } : {}),
  }
}

export function normalizeCustomPricing(
  raw: unknown,
  options?: { strict?: boolean; field?: string },
): StoredModelCustomPricing | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!isRecord(raw)) {
    if (options?.strict) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'MODEL_CUSTOM_PRICING_INVALID',
        field: options.field || 'models.customPricing',
      })
    }
    return undefined
  }
  if (options?.strict) {
    validateAllowedObjectKeys(raw, ['llm', 'image', 'video', 'music', 'input', 'output'], options.field || 'models.customPricing')
  }

  const llmRaw = isRecord(raw.llm) ? raw.llm : raw
  if (options?.strict && raw.llm !== undefined && !isRecord(raw.llm)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_CUSTOM_PRICING_INVALID',
      field: options.field ? `${options.field}.llm` : 'models.customPricing.llm',
    })
  }
  if (options?.strict && isRecord(raw.llm)) {
    validateAllowedObjectKeys(raw.llm, ['inputPerMillion', 'outputPerMillion'], options.field ? `${options.field}.llm` : 'models.customPricing.llm')
  }
  const inputPerMillion = options?.strict
    ? parseNonNegativeNumberStrict(llmRaw.inputPerMillion, options.field ? `${options.field}.llm.inputPerMillion` : 'models.customPricing.llm.inputPerMillion')
    : readNonNegativeNumber(llmRaw.inputPerMillion)
  const outputPerMillion = options?.strict
    ? parseNonNegativeNumberStrict(llmRaw.outputPerMillion, options.field ? `${options.field}.llm.outputPerMillion` : 'models.customPricing.llm.outputPerMillion')
    : readNonNegativeNumber(llmRaw.outputPerMillion)
  // Legacy bridge: migrate old shape { input, output } into llm.*
  const legacyInput = options?.strict
    ? parseNonNegativeNumberStrict((raw as Record<string, unknown>).input, options.field ? `${options.field}.input` : 'models.customPricing.input')
    : readNonNegativeNumber((raw as Record<string, unknown>).input)
  const legacyOutput = options?.strict
    ? parseNonNegativeNumberStrict((raw as Record<string, unknown>).output, options.field ? `${options.field}.output` : 'models.customPricing.output')
    : readNonNegativeNumber((raw as Record<string, unknown>).output)
  const llm = (inputPerMillion !== undefined || outputPerMillion !== undefined || legacyInput !== undefined || legacyOutput !== undefined)
    ? {
      ...(inputPerMillion !== undefined ? { inputPerMillion } : {}),
      ...(outputPerMillion !== undefined ? { outputPerMillion } : {}),
      ...(inputPerMillion === undefined && legacyInput !== undefined ? { inputPerMillion: legacyInput } : {}),
      ...(outputPerMillion === undefined && legacyOutput !== undefined ? { outputPerMillion: legacyOutput } : {}),
    }
    : undefined
  if (
    options?.strict
    && llm
    && (
      typeof llm.inputPerMillion !== 'number'
      || typeof llm.outputPerMillion !== 'number'
    )
  ) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_CUSTOM_PRICING_INVALID',
      field: options.field ? `${options.field}.llm` : 'models.customPricing.llm',
    })
  }

  const image = normalizeMediaCustomPricing(raw.image, {
    strict: options?.strict,
    field: options?.field ? `${options.field}.image` : 'models.customPricing.image',
  })
  const video = normalizeMediaCustomPricing(raw.video, {
    strict: options?.strict,
    field: options?.field ? `${options.field}.video` : 'models.customPricing.video',
  })
  const music = normalizeMediaCustomPricing(raw.music, {
    strict: options?.strict,
    field: options?.field ? `${options.field}.music` : 'models.customPricing.music',
  })

  if (!llm && !image && !video && !music) return undefined
  return {
    ...(llm ? { llm } : {}),
    ...(image ? { image } : {}),
    ...(video ? { video } : {}),
    ...(music ? { music } : {}),
  }
}

export function hasCustomPricingForType(model: StoredModel): boolean {
  if (!model.customPricing) return false
  if (model.type === 'llm') {
    return (
      typeof model.customPricing.llm?.inputPerMillion === 'number'
      && typeof model.customPricing.llm?.outputPerMillion === 'number'
    )
  }
  if (model.type === 'image') {
    const imagePricing = model.customPricing.image
    return (
      typeof imagePricing?.basePrice === 'number'
      || (isRecord(imagePricing?.optionPrices) && Object.keys(imagePricing.optionPrices).length > 0)
    )
  }
  if (model.type === 'video') {
    const videoPricing = model.customPricing.video
    return (
      typeof videoPricing?.basePrice === 'number'
      || (isRecord(videoPricing?.optionPrices) && Object.keys(videoPricing.optionPrices).length > 0)
    )
  }
  if (model.type === 'music') {
    const musicPricing = model.customPricing.music
    return (
      typeof musicPricing?.basePrice === 'number'
      || (isRecord(musicPricing?.optionPrices) && Object.keys(musicPricing.optionPrices).length > 0)
    )
  }
  return false
}
