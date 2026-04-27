import { describe, expect, it } from 'vitest'
import {
  parseDirectorStyleConfig,
  parseStylePresetRef,
  parseVisualStyleConfig,
} from '@/lib/style-preset'
import { buildDirectorStyleDoc } from '@/lib/director-style'

describe('style preset schema', () => {
  it('validates visual style configs with explicit fields', () => {
    expect(parseVisualStyleConfig({
      prompt: 'warm watercolor',
      negativePrompt: 'no harsh neon',
      colorPalette: ['warm amber', 'soft green'],
      lineStyle: 'thin ink',
      texture: 'paper grain',
      lighting: 'soft morning light',
      composition: 'centered subject',
      detailLevel: 'medium',
    })).toEqual({
      prompt: 'warm watercolor',
      negativePrompt: 'no harsh neon',
      colorPalette: ['warm amber', 'soft green'],
      lineStyle: 'thin ink',
      texture: 'paper grain',
      lighting: 'soft morning light',
      composition: 'centered subject',
      detailLevel: 'medium',
    })
  })

  it('rejects invalid visual style detail levels', () => {
    expect(() => parseVisualStyleConfig({
      prompt: 'warm watercolor',
      negativePrompt: '',
      colorPalette: [],
      lineStyle: '',
      texture: '',
      lighting: '',
      composition: '',
      detailLevel: 'extreme',
    })).toThrow()
  })

  it('rejects empty visual style prompts', () => {
    expect(() => parseVisualStyleConfig({
      prompt: '   ',
      negativePrompt: '',
      colorPalette: [],
      lineStyle: '',
      texture: '',
      lighting: '',
      composition: '',
      detailLevel: 'medium',
    })).toThrow()
  })

  it('validates director style configs using the per-stage director field shape', () => {
    const doc = buildDirectorStyleDoc('horror-suspense')

    expect(parseDirectorStyleConfig(doc).image.prompt).toBe(doc.image.prompt)
  })

  it('parses explicit preset refs', () => {
    expect(parseStylePresetRef({
      presetSource: 'user',
      presetId: 'preset-1',
    })).toEqual({
      presetSource: 'user',
      presetId: 'preset-1',
    })
  })
})
