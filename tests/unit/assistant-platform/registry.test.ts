import { describe, expect, it } from 'vitest'
import { getAssistantSkill, isAssistantId } from '@/lib/assistant-platform'

describe('assistant-platform registry', () => {
  it('recognizes supported assistant ids', () => {
    expect(isAssistantId('api-config-template')).toBe(true)
    expect(isAssistantId('tutorial')).toBe(true)
    expect(isAssistantId('unknown')).toBe(false)
  })

  it('returns registered skills', () => {
    expect(getAssistantSkill('api-config-template').id).toBe('api-config-template')
    expect(getAssistantSkill('tutorial').id).toBe('tutorial')
  })
})
