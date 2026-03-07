import type { BillingMode } from './types'

const VALID_MODES: BillingMode[] = ['OFF', 'SHADOW', 'ENFORCE']

function normalizeMode(input: unknown): BillingMode | null {
  if (typeof input !== 'string') return null
  const upper = input.toUpperCase()
  if (!VALID_MODES.includes(upper as BillingMode)) return null
  return upper as BillingMode
}

function getModeFromEnv(): BillingMode {
  return normalizeMode(process.env.BILLING_MODE) || 'OFF'
}

export async function getBillingMode(): Promise<BillingMode> {
  return getModeFromEnv()
}

export function getBootBillingEnabled() {
  return getModeFromEnv() === 'ENFORCE'
}
