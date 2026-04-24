import { describe, expect, it } from 'vitest'
import { validateAiOptions } from '@/lib/ai-exec/normalize'
import { buildLlmOptionSchema } from '@/lib/ai-providers/adapters/llm/option-schema'

describe('llm option schema', () => {
  it('rejects unknown option keys', () => {
    expect(() => validateAiOptions({
      schema: buildLlmOptionSchema(),
      options: { temperature: 0.7, unknownKey: true } as unknown,
      context: 'llm:test',
    })).toThrow('AI_OPTION_UNSUPPORTED:llm:test:unknownKey')
  })

  it('validates reasoningEffort enum', () => {
    expect(() => validateAiOptions({
      schema: buildLlmOptionSchema(),
      options: { reasoningEffort: 'extreme' } as unknown,
      context: 'llm:test',
    })).toThrow('AI_OPTION_INVALID:llm:test:reasoningEffort:unsupported_value=extreme')
  })
})

