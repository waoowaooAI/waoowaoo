import { describe, expect, it } from 'vitest'
import {
  countGeneratedImageSlots,
  resolveImageSlotPhase,
  shouldShowImageSlotGrid,
} from '@/lib/image-generation/slot-state'

describe('image slot state', () => {
  it('counts only slots with image urls', () => {
    expect(countGeneratedImageSlots([
      { imageUrl: 'a.png' },
      { imageUrl: null },
      { imageUrl: 'b.png' },
    ])).toBe(2)
  })

  it('distinguishes generate and regenerate phases', () => {
    expect(resolveImageSlotPhase({ imageUrl: null }, true)).toBe('generating')
    expect(resolveImageSlotPhase({ imageUrl: 'a.png' }, true)).toBe('regenerating')
    expect(resolveImageSlotPhase({ imageUrl: null }, false)).toBe('idle-empty')
    expect(resolveImageSlotPhase({ imageUrl: 'a.png' }, false)).toBe('idle-filled')
  })

  it('shows slot grid only after generation is active or meaningful', () => {
    expect(shouldShowImageSlotGrid({
      totalSlotCount: 3,
      generatedCount: 0,
      hasRunningTask: false,
      hasAnyError: false,
    })).toBe(false)

    expect(shouldShowImageSlotGrid({
      totalSlotCount: 3,
      generatedCount: 0,
      hasRunningTask: true,
      hasAnyError: false,
    })).toBe(true)

    expect(shouldShowImageSlotGrid({
      totalSlotCount: 3,
      generatedCount: 1,
      hasRunningTask: false,
      hasAnyError: false,
    })).toBe(true)
  })
})
