import { describe, expect, it } from 'vitest'
import {
  buildWebtoonScrollNarrativePreview,
  WEBTOON_PANEL_QUICK_ACTIONS,
} from '@/lib/workspace/webtoon-panel-controls'

describe('webtoon panel controls helpers (VAT-133 P0)', () => {
  it('exposes 5 panel-first quick actions', () => {
    expect(WEBTOON_PANEL_QUICK_ACTIONS.map((x) => x.id)).toEqual([
      'add',
      'duplicate',
      'split',
      'merge',
      'reorder',
    ])
  })

  it('builds dense-six-panel preview with stable shape and normalized heights', () => {
    const preview = buildWebtoonScrollNarrativePreview({
      panelSlotCount: 6,
      layoutFamily: 'dense-six-panel',
    })

    expect(preview).toHaveLength(6)
    expect(preview[0]?.emphasis).toBe('anchor')
    expect(preview[5]?.emphasis).toBe('transition')
    expect(preview.slice(1, -1).every((item) => item.emphasis === 'support')).toBe(true)

    const sum = preview.reduce((acc, item) => acc + item.relativeHeight, 0)
    expect(sum).toBeGreaterThan(0.98)
    expect(sum).toBeLessThan(1.02)
  })

  it('uses fallback weights when layout family is unknown', () => {
    const preview = buildWebtoonScrollNarrativePreview({
      panelSlotCount: 4,
      layoutFamily: 'unknown-family',
    })

    expect(preview).toHaveLength(4)
    expect(preview[0]?.panelIndex).toBe(1)
    expect(preview[3]?.panelIndex).toBe(4)
    expect(preview[0]?.relativeHeight).toBeLessThan(preview[3]?.relativeHeight ?? 0)
  })
})
