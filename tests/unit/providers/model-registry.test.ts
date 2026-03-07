import { beforeEach, describe, expect, it } from 'vitest'
import {
  assertOfficialModelRegistered,
  isOfficialModelRegistered,
  registerOfficialModel,
  resetOfficialModelRegistryForTest,
} from '@/lib/providers/official/model-registry'

describe('official model registry', () => {
  beforeEach(() => {
    resetOfficialModelRegistryForTest()
  })

  it('throws MODEL_NOT_REGISTERED when model is absent', () => {
    expect(() =>
      assertOfficialModelRegistered({
        provider: 'bailian',
        modality: 'llm',
        modelId: 'qwen-plus',
      }),
    ).toThrow(/MODEL_NOT_REGISTERED/)
  })

  it('accepts registered official model', () => {
    registerOfficialModel({
      provider: 'siliconflow',
      modality: 'image',
      modelId: 'sf-image',
    })

    expect(
      isOfficialModelRegistered({
        provider: 'siliconflow',
        modality: 'image',
        modelId: 'sf-image',
      }),
    ).toBe(true)
  })
})
