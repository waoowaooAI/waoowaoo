import { describe, expect, it } from 'vitest'
import { buildArkThinkingParam } from '@/lib/ark-llm'

describe('ark thinking param builder', () => {
  it('builds enabled thinking param without reasoning_effort', () => {
    const params = buildArkThinkingParam('doubao-seed-2-0-lite-260215', true)
    expect(params).toEqual({
      thinking: {
        type: 'enabled',
      },
    })
  })

  it('builds disabled thinking param without reasoning_effort', () => {
    const params = buildArkThinkingParam('doubao-seed-2-0-lite-260215', false)
    expect(params).toEqual({
      thinking: {
        type: 'disabled',
      },
    })
  })
})
