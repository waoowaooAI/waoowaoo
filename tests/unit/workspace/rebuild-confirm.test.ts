import { describe, expect, it } from 'vitest'
import { hasDownstreamStoryboardData } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useRebuildConfirm'

describe('hasDownstreamStoryboardData', () => {
  it('returns false when storyboard and panel counts are both zero', () => {
    expect(hasDownstreamStoryboardData({ storyboardCount: 0, panelCount: 0 })).toBe(false)
  })

  it('returns true when storyboard count is greater than zero', () => {
    expect(hasDownstreamStoryboardData({ storyboardCount: 1, panelCount: 0 })).toBe(true)
  })

  it('returns true when panel count is greater than zero', () => {
    expect(hasDownstreamStoryboardData({ storyboardCount: 0, panelCount: 2 })).toBe(true)
  })
})
