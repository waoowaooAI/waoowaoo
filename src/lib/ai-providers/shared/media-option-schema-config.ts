import type { AiOptionSchema } from '@/lib/ai-registry/types'

export type MediaOptionValidatorConfig =
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'integer'; min?: number; max?: number }
  | { kind: 'boolean' }
  | { kind: 'nonEmptyString' }

export type MediaOptionObjectValidatorKind =
  | 'falVideoModel'
  | 'minimaxVideo'
  | 'viduVideo'
  | 'openAiCompatibleVideo'

export type MediaOptionSchemaConfig = {
  allowedKeys?: readonly string[]
  required?: readonly string[]
  requiresOneOf?: AiOptionSchema['requiresOneOf']
  conflicts?: AiOptionSchema['conflicts']
  validators?: Readonly<Record<string, MediaOptionValidatorConfig>>
  objectValidatorKind?: MediaOptionObjectValidatorKind
}
