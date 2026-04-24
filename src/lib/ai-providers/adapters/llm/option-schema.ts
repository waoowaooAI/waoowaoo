import type { AiOptionSchema, AiOptionValidationResult, AiOptionValidator } from '@/lib/ai-registry/types'

function ok(): AiOptionValidationResult {
  return { ok: true }
}

function fail(reason: string): AiOptionValidationResult {
  return { ok: false, reason }
}

function passthroughValidator(): AiOptionValidationResult {
  return ok()
}

function booleanValidator(): AiOptionValidator {
  return (value) => {
    if (value === undefined) return ok()
    return typeof value === 'boolean' ? ok() : fail('expected_boolean')
  }
}

function nonEmptyStringValidator(): AiOptionValidator {
  return (value) => {
    if (value === undefined) return ok()
    if (typeof value !== 'string') return fail('expected_string')
    return value.trim().length > 0 ? ok() : fail('expected_non_empty_string')
  }
}

function integerRangeValidator(input: { min?: number; max?: number }): AiOptionValidator {
  return (value) => {
    if (value === undefined) return ok()
    if (typeof value !== 'number' || !Number.isInteger(value)) return fail('expected_integer')
    if (input.min !== undefined && value < input.min) return fail(`min=${input.min}`)
    if (input.max !== undefined && value > input.max) return fail(`max=${input.max}`)
    return ok()
  }
}

function numberRangeValidator(input: { min?: number; max?: number }): AiOptionValidator {
  return (value) => {
    if (value === undefined) return ok()
    if (typeof value !== 'number' || !Number.isFinite(value)) return fail('expected_number')
    if (input.min !== undefined && value < input.min) return fail(`min=${input.min}`)
    if (input.max !== undefined && value > input.max) return fail(`max=${input.max}`)
    return ok()
  }
}

function enumValidator(values: readonly string[]): AiOptionValidator {
  const allowed = new Set(values)
  return (value) => {
    if (value === undefined) return ok()
    if (typeof value !== 'string') return fail('expected_string')
    return allowed.has(value) ? ok() : fail(`unsupported_value=${value}`)
  }
}

const LLM_ALLOWED_KEYS = [
  'temperature',
  'reasoning',
  'reasoningEffort',
  'maxRetries',
  'projectId',
  'action',
  'streamStepId',
  'streamStepAttempt',
  'streamStepTitle',
  'streamStepIndex',
  'streamStepTotal',
  '__skipAutoStream',
] as const

export function buildLlmOptionSchema(): AiOptionSchema {
  const allowedKeys = new Set<string>(LLM_ALLOWED_KEYS)
  const validators = Object.fromEntries(
    Array.from(allowedKeys).map((key) => [key, passthroughValidator]),
  ) as Record<string, AiOptionValidator>

  validators.temperature = numberRangeValidator({ min: 0, max: 2 })
  validators.reasoning = booleanValidator()
  validators.reasoningEffort = enumValidator(['minimal', 'low', 'medium', 'high'])
  validators.maxRetries = integerRangeValidator({ min: 0, max: 10 })

  validators.projectId = nonEmptyStringValidator()
  validators.action = nonEmptyStringValidator()
  validators.streamStepId = nonEmptyStringValidator()
  validators.streamStepTitle = nonEmptyStringValidator()
  validators.streamStepAttempt = integerRangeValidator({ min: 0 })
  validators.streamStepIndex = integerRangeValidator({ min: 0 })
  validators.streamStepTotal = integerRangeValidator({ min: 0 })
  validators.__skipAutoStream = booleanValidator()

  return {
    allowedKeys,
    validators,
  }
}

