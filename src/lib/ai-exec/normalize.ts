import type { AiOptionSchema } from '@/lib/ai-registry/types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function validateAiOptions(input: {
  schema: AiOptionSchema
  options: unknown
  context: string
}): void {
  if (input.options === undefined || input.options === null) {
    if (input.schema.required?.length) {
      throw new Error(`AI_OPTION_REQUIRED:${input.context}:${input.schema.required[0]}`)
    }
    if (input.schema.requiresOneOf?.length) {
      throw new Error(`AI_OPTION_REQUIRED:${input.context}:${input.schema.requiresOneOf[0].message}`)
    }
    return
  }
  if (!isRecord(input.options)) {
    throw new Error(`AI_OPTIONS_INVALID:${input.context}`)
  }
  const options = input.options
  for (const [key, value] of Object.entries(options)) {
    if (!input.schema.allowedKeys.has(key)) {
      throw new Error(`AI_OPTION_UNSUPPORTED:${input.context}:${key}`)
    }
  }
  for (const requiredKey of input.schema.required || []) {
    const value = options[requiredKey]
    if (value === undefined || value === null || value === '') {
      throw new Error(`AI_OPTION_REQUIRED:${input.context}:${requiredKey}`)
    }
  }
  for (const oneOf of input.schema.requiresOneOf || []) {
    const hasValue = oneOf.keys.some((key) => {
      const value = options[key]
      return value !== undefined && value !== null && value !== ''
    })
    if (!hasValue) {
      throw new Error(`AI_OPTION_REQUIRED:${input.context}:${oneOf.message}`)
    }
  }
  for (const conflict of input.schema.conflicts || []) {
    const presentKeys = conflict.keys.filter((key) => {
      const value = options[key]
      return value !== undefined && value !== null && value !== ''
    })
    if (presentKeys.length > 1) {
      if (conflict.allowSameValue) {
        const firstValue = options[presentKeys[0]]
        const hasDifferentValue = presentKeys.some((key) => options[key] !== firstValue)
        if (!hasDifferentValue) continue
      }
      throw new Error(`AI_OPTION_CONFLICT:${input.context}:${conflict.message}`)
    }
  }
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue
    const validator = input.schema.validators[key]
    if (!validator) continue
    const result = validator(value)
    if (!result.ok) {
      throw new Error(`AI_OPTION_INVALID:${input.context}:${key}:${result.reason}`)
    }
  }
  for (const validator of input.schema.objectValidators || []) {
    const result = validator(options)
    if (!result.ok) {
      throw new Error(`AI_OPTION_INVALID:${input.context}:${result.reason}`)
    }
  }
}
