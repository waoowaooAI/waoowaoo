import { describe, expect, it } from 'vitest'
import {
  normalizeVideoGenerationSelections,
  resolveEffectiveVideoCapabilityDefinitions,
  resolveEffectiveVideoCapabilityFields,
} from '@/lib/model-capabilities/video-effective'
import type { VideoPricingTier } from '@/lib/model-pricing/video-tier'

const GOOGLE_VEO_TIERS: VideoPricingTier[] = [
  { when: { resolution: '720p', duration: 4 } },
  { when: { resolution: '720p', duration: 6 } },
  { when: { resolution: '720p', duration: 8 } },
  { when: { resolution: '1080p', duration: 8 } },
  { when: { resolution: '4k', duration: 8 } },
]

describe('model-capabilities/video-effective', () => {
  it('derives capability definitions from pricing tiers', () => {
    const definitions = resolveEffectiveVideoCapabilityDefinitions({
      pricingTiers: GOOGLE_VEO_TIERS,
    })
    const byField = new Map(definitions.map((item) => [item.field, item.options]))

    expect(byField.get('resolution')).toEqual(['720p', '1080p', '4k'])
    expect(byField.get('duration')).toEqual([4, 6, 8])
  })

  it('keeps pinned field and adjusts the linked field to nearest supported combo', () => {
    const definitions = resolveEffectiveVideoCapabilityDefinitions({
      pricingTiers: GOOGLE_VEO_TIERS,
    })

    const normalized = normalizeVideoGenerationSelections({
      definitions,
      pricingTiers: GOOGLE_VEO_TIERS,
      selection: {
        resolution: '1080p',
        duration: 4,
      },
      pinnedFields: ['resolution'],
    })

    expect(normalized).toEqual({
      resolution: '1080p',
      duration: 8,
    })
  })

  it('filters dependent options by current selection', () => {
    const definitions = resolveEffectiveVideoCapabilityDefinitions({
      pricingTiers: GOOGLE_VEO_TIERS,
    })
    const fields = resolveEffectiveVideoCapabilityFields({
      definitions,
      pricingTiers: GOOGLE_VEO_TIERS,
      selection: {
        resolution: '1080p',
      },
    })
    const durationField = fields.find((field) => field.field === 'duration')

    expect(durationField?.options).toEqual([8])
    expect(durationField?.value).toBe(8)
  })
})

