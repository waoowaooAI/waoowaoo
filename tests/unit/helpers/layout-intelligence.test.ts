import { describe, expect, it } from 'vitest'
import { evaluateLayoutIntelligence } from '@/lib/novel-promotion/layout-intelligence'

describe('layout intelligence v1', () => {
  it('recommends four-koma profile for comedy rhythm and dense dialogue', () => {
    const decision = evaluateLayoutIntelligence({
      content: '"Wake up!" "Late again!" A funny punchline lands and everyone laughs.',
      preset: 'comedy-4koma',
      manualLayout: 'auto',
    })

    expect(decision.recommendedProfile).toBe('four-koma-rhythm')
    expect(decision.chosenLayout).toBe('four-koma')
    expect(decision.decisionSource).toBe('auto_recommendation')
  })

  it('recommends splash profile for action intensity', () => {
    const decision = evaluateLayoutIntelligence({
      content: 'BATTLE begins! Huge EXPLOSION and impact as the boss attacks.',
      preset: 'action-battle',
      manualLayout: 'auto',
    })

    expect(decision.recommendedProfile).toBe('splash-impact')
    expect(decision.chosenLayout).toBe('splash-focus')
  })

  it('honors manual layout override', () => {
    const decision = evaluateLayoutIntelligence({
      content: 'Calm chapter transitions with reflective pacing.',
      preset: 'slice-of-life',
      manualLayout: 'vertical-scroll',
    })

    expect(decision.decisionSource).toBe('manual_override')
    expect(decision.chosenLayout).toBe('vertical-scroll')
    expect(decision.chosenProfile).toBe('vertical-strip-flow')
  })
})
