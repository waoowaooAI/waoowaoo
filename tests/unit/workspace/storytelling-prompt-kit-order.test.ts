import { describe, expect, it } from 'vitest'
import {
  getStorytellingPromptKitById,
  orderStorytellingPromptKits,
  STORYTELLING_PROMPT_KIT_PHASE_ORDER,
} from '@/lib/workspace/storytelling-prompt-kit'

describe('storytelling prompt kit ordering helpers (VAT-135)', () => {
  it('orders kits by canonical storytelling phase order', () => {
    const ordered = orderStorytellingPromptKits([
      { id: 'payoff' },
      { id: 'setup' },
      { id: 'opening' },
      { id: 'conflict' },
    ])

    expect(ordered.map((item) => item.id)).toEqual(['opening', 'setup', 'conflict', 'payoff'])
  })

  it('exposes stable phase list and lookup helper', () => {
    expect(STORYTELLING_PROMPT_KIT_PHASE_ORDER[0]).toBe('opening')
    expect(STORYTELLING_PROMPT_KIT_PHASE_ORDER.at(-1)).toBe('cliffhanger')

    const kits = [{ id: 'opening' }, { id: 'payoff' }]
    expect(getStorytellingPromptKitById(kits, 'payoff')?.id).toBe('payoff')
    expect(getStorytellingPromptKitById(kits, 'unknown')).toBeNull()
  })
})
