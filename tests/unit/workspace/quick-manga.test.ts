import { describe, expect, it } from 'vitest'
import {
  buildQuickMangaStoryInput,
  type QuickMangaOptions,
} from '@/lib/novel-promotion/quick-manga'

describe('quick manga story input builder', () => {
  const baseOptions: QuickMangaOptions = {
    enabled: true,
    preset: 'comedy-4koma',
    layout: 'four-koma',
    colorMode: 'black-white',
  }

  it('prepends directive block when quick manga is enabled', () => {
    const merged = buildQuickMangaStoryInput({
      storyContent: 'A student wakes up late and runs to school.',
      options: baseOptions,
      artStyle: 'american-comic',
    })

    expect(merged).toContain('[QUICK_MANGA_ENTRY]')
    expect(merged).toContain('Preset: Comedy 4-koma')
    expect(merged).toContain('Panel Layout Input: 4-koma Rhythm')
    expect(merged).toContain('Panel Layout Resolved: 4-koma Rhythm')
    expect(merged).toContain('Color Mode: Black & White')
    expect(merged).toContain('Visual Style: american-comic')
    expect(merged).toContain('[LAYOUT_INTELLIGENCE_V1]')
    expect(merged).toContain('A student wakes up late and runs to school.')
  })

  it('returns trimmed base content when quick manga is disabled', () => {
    const merged = buildQuickMangaStoryInput({
      storyContent: '   plain story   ',
      options: {
        ...baseOptions,
        enabled: false,
      },
      artStyle: 'american-comic',
    })

    expect(merged).toBe('plain story')
  })
})
