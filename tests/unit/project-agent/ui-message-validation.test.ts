import { describe, expect, it } from 'vitest'
import { isPersistableUIMessages } from '@/lib/project-agent/ui-message-validation'

describe('isPersistableUIMessages', () => {
  it('rejects non-array input', () => {
    expect(isPersistableUIMessages({})).toBe(false)
  })

  it('rejects messages missing required core fields', () => {
    expect(isPersistableUIMessages([{ role: 'assistant', parts: [{ type: 'text', text: 'hi' }] }])).toBe(false)
    expect(isPersistableUIMessages([{ id: 'x', role: 'assistant', parts: [] }])).toBe(false)
  })

  it('accepts a minimal valid UIMessage list', () => {
    expect(isPersistableUIMessages([
      {
        id: 'm1',
        role: 'user',
        parts: [{ type: 'text', text: 'hi' }],
      },
    ])).toBe(true)
  })
})

