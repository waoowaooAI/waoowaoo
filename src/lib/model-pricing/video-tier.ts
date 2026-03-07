import type { CapabilityValue } from '@/lib/model-config-contract'

export interface VideoPricingTier {
  when: Record<string, CapabilityValue>
}

function matchesFixedSelections(
  tier: VideoPricingTier,
  fixedSelections: Record<string, CapabilityValue>,
): boolean {
  for (const [field, expectedValue] of Object.entries(fixedSelections)) {
    const tierValue = tier.when[field]
    if (tierValue !== undefined && tierValue !== expectedValue) {
      return false
    }
  }
  return true
}

export function projectVideoPricingTiersByFixedSelections(input: {
  tiers: VideoPricingTier[]
  fixedSelections: Record<string, CapabilityValue>
}): VideoPricingTier[] {
  const { tiers, fixedSelections } = input
  if (tiers.length === 0) return []
  if (Object.keys(fixedSelections).length === 0) {
    return tiers.map((tier) => ({ when: { ...tier.when } }))
  }

  const hiddenFields = new Set(Object.keys(fixedSelections))
  const projected: VideoPricingTier[] = []

  for (const tier of tiers) {
    if (!matchesFixedSelections(tier, fixedSelections)) continue

    const nextWhen: Record<string, CapabilityValue> = {}
    for (const [field, value] of Object.entries(tier.when)) {
      if (hiddenFields.has(field)) continue
      nextWhen[field] = value
    }
    projected.push({ when: nextWhen })
  }

  return projected
}
