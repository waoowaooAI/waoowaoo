import { describe, expect, it } from 'vitest'
import {
  PRESET_MODELS,
  encodeModelKey,
  isPresetComingSoonModel,
  isPresetComingSoonModelKey,
} from '@/app/[locale]/profile/components/api-config/types'

describe('api-config preset coming soon', () => {
  it('registers Nano Banana 2 under Google AI Studio presets', () => {
    const model = PRESET_MODELS.find(
      (entry) => entry.provider === 'google' && entry.modelId === 'gemini-3.1-flash-image-preview',
    )
    expect(model).toBeDefined()
    expect(model?.name).toBe('Nano Banana 2')
  })

  it('registers Seedance 2.0 as a coming-soon preset model', () => {
    const model = PRESET_MODELS.find(
      (entry) => entry.provider === 'ark' && entry.modelId === 'doubao-seedance-2-0-260128',
    )
    expect(model).toBeDefined()
    expect(model?.name).toContain('待上线')
  })

  it('recognizes coming-soon model by provider/modelId and modelKey', () => {
    const modelKey = encodeModelKey('ark', 'doubao-seedance-2-0-260128')
    expect(isPresetComingSoonModel('ark', 'doubao-seedance-2-0-260128')).toBe(true)
    expect(isPresetComingSoonModelKey(modelKey)).toBe(true)
  })

  it('does not mark normal preset models as coming soon', () => {
    const modelKey = encodeModelKey('ark', 'doubao-seedance-1-5-pro-251215')
    expect(isPresetComingSoonModel('ark', 'doubao-seedance-1-5-pro-251215')).toBe(false)
    expect(isPresetComingSoonModelKey(modelKey)).toBe(false)
  })

  it('registers Bailian Wan i2v preset models', () => {
    const modelIds = PRESET_MODELS
      .filter((entry) => entry.provider === 'bailian' && entry.type === 'video')
      .map((entry) => entry.modelId)

    expect(modelIds).toEqual(expect.arrayContaining([
      'wan2.6-i2v-flash',
      'wan2.6-i2v',
      'wan2.5-i2v-preview',
      'wan2.2-i2v-plus',
      'wan2.2-kf2v-flash',
      'wanx2.1-kf2v-plus',
    ]))
  })
})
