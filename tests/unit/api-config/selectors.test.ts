import { describe, expect, it } from 'vitest'
import {
  applyMissingCapabilityDefaults,
  clearMissingDefaultModels,
  mergeModelsForDisplay,
  resolvePricingDisplay,
} from '@/app/[locale]/profile/components/api-config/selectors'
import type { CustomModel, PricingDisplayMap } from '@/app/[locale]/profile/components/api-config/types'

function model(overrides: Partial<CustomModel> & Pick<CustomModel, 'provider' | 'modelId' | 'type'>): CustomModel {
  const modelKey = `${overrides.provider}::${overrides.modelId}`
  return {
    ...overrides,
    modelId: overrides.modelId,
    modelKey,
    name: overrides.name ?? overrides.modelId,
    type: overrides.type,
    provider: overrides.provider,
    price: overrides.price ?? 0,
    enabled: overrides.enabled ?? true,
  }
}

describe('api-config selectors', () => {
  it('mergeModelsForDisplay uses server catalog order and saved enabled state', () => {
    const catalogModels = [
      model({ provider: 'ark', modelId: 'doubao-seedream-3-0-t2i-250415', type: 'image', enabled: false }),
      model({ provider: 'fal', modelId: 'fal-ai/kling-video/v2/master/text-to-video', type: 'video', enabled: false }),
    ]
    const savedModels = [
      model({ provider: 'fal', modelId: 'fal-ai/kling-video/v2/master/text-to-video', type: 'video', enabled: true }),
      model({ provider: 'openai-compatible:custom', modelId: 'my-image-model', type: 'image', enabled: false }),
    ]

    const merged = mergeModelsForDisplay(savedModels, catalogModels, {})

    expect(merged.map((item) => item.modelKey)).toEqual([
      'ark::doubao-seedream-3-0-t2i-250415',
      'fal::fal-ai/kling-video/v2/master/text-to-video',
      'openai-compatible:custom::my-image-model',
    ])
    expect(merged.map((item) => item.enabled)).toEqual([false, true, false])
  })

  it('resolvePricingDisplay applies provider key and explicit alias lookups', () => {
    const pricingDisplay: PricingDisplayMap = {
      'image::openai-compatible::gpt-image-1': { min: 1, max: 3, label: '$1-3' },
      'image::google::gemini-2.5-flash-image': { min: 2, max: 4, label: '$2-4' },
    }

    expect(resolvePricingDisplay(pricingDisplay, 'image', 'openai-compatible:tenant-a', 'gpt-image-1')).toEqual({
      min: 1,
      max: 3,
      label: '$1-3',
    })
    expect(resolvePricingDisplay(pricingDisplay, 'image', 'gemini-compatible:tenant-b', 'gemini-2.5-flash-image')).toEqual({
      min: 2,
      max: 4,
      label: '$2-4',
    })
  })

  it('clearMissingDefaultModels clears only defaults pointing to removed models', () => {
    const next = clearMissingDefaultModels({
      analysisModel: 'openai::gpt-5-mini',
      videoModel: 'fal::video-a',
      audioModel: 'bailian::cosyvoice',
    }, new Set(['openai::gpt-5-mini', 'bailian::cosyvoice']))

    expect(next).toEqual({
      analysisModel: 'openai::gpt-5-mini',
      videoModel: '',
      audioModel: 'bailian::cosyvoice',
    })
  })

  it('applyMissingCapabilityDefaults fills only missing capability options', () => {
    const result = applyMissingCapabilityDefaults({
      'fal::video-a': { duration: 10 },
    }, 'fal::video-a', [
      { field: 'duration', options: [5, 10] },
      { field: 'resolution', options: ['720p', '1080p'] },
    ])

    expect(result.changed).toBe(true)
    expect(result.capabilityDefaults).toEqual({
      'fal::video-a': {
        duration: 10,
        resolution: '720p',
      },
    })
  })

  it('applyMissingCapabilityDefaults keeps existing selections unchanged', () => {
    const previous = {
      'fal::video-a': { duration: 10, resolution: '1080p' },
    }
    const result = applyMissingCapabilityDefaults(previous, 'fal::video-a', [
      { field: 'duration', options: [5, 10] },
      { field: 'resolution', options: ['720p', '1080p'] },
    ])

    expect(result.changed).toBe(false)
    expect(result.capabilityDefaults).toBe(previous)
  })
})
