import { describe, expect, it } from 'vitest'
import { findBuiltinCapabilities } from '@/lib/model-capabilities/catalog'

describe('bailian video capabilities catalog', () => {
  it('registers bailian i2v models as normal-mode only', () => {
    const models = [
      'wan2.6-i2v-flash',
      'wan2.6-i2v',
      'wan2.5-i2v-preview',
      'wan2.2-i2v-plus',
    ]

    for (const modelId of models) {
      const capabilities = findBuiltinCapabilities('video', 'bailian', modelId)
      expect(capabilities?.video?.generationModeOptions).toEqual(['normal'])
      expect(capabilities?.video?.firstlastframe).toBe(false)
    }
  })

  it('registers bailian kf2v models as firstlastframe-only', () => {
    const models = [
      'wan2.2-kf2v-flash',
      'wanx2.1-kf2v-plus',
    ]

    for (const modelId of models) {
      const capabilities = findBuiltinCapabilities('video', 'bailian', modelId)
      expect(capabilities?.video?.generationModeOptions).toEqual(['firstlastframe'])
      expect(capabilities?.video?.firstlastframe).toBe(true)
    }
  })
})
