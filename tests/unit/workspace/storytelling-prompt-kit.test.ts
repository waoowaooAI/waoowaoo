import { describe, expect, it } from 'vitest'
import { STORY_KITS } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/MangaPanelControls'

describe('storytelling prompt kit presets (VAT-135)', () => {
  it('exposes required panel-role kits for manga storytelling flow', () => {
    const ids = STORY_KITS.map((kit) => kit.id)

    expect(ids).toEqual(expect.arrayContaining([
      'opening',
      'setup',
      'conflict',
      'payoff',
      'cliffhanger',
    ]))
  })

  it('keeps each kit mapped to valid quick-manga values', () => {
    const validPreset = new Set(['auto', 'action-battle', 'romance-drama', 'slice-of-life', 'comedy-4koma'])
    const validLayout = new Set(['auto', 'cinematic', 'four-koma', 'vertical-scroll', 'splash-focus'])
    const validColor = new Set(['auto', 'full-color', 'black-white', 'limited-palette'])

    for (const kit of STORY_KITS) {
      expect(validPreset.has(kit.values.preset)).toBe(true)
      expect(validLayout.has(kit.values.layout)).toBe(true)
      expect(validColor.has(kit.values.colorMode)).toBe(true)
      expect(kit.values.styleLockStrength).toBeGreaterThanOrEqual(0)
      expect(kit.values.styleLockStrength).toBeLessThanOrEqual(1)
    }
  })
})
