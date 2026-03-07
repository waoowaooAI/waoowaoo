import { describe, expect, it } from 'vitest'
import { getBillingMode, getBootBillingEnabled } from '@/lib/billing/mode'

describe('billing/mode', () => {
  it('falls back to OFF when env is missing', async () => {
    delete process.env.BILLING_MODE
    await expect(getBillingMode()).resolves.toBe('OFF')
    expect(getBootBillingEnabled()).toBe(false)
  })

  it('normalizes lower-case env mode', async () => {
    process.env.BILLING_MODE = 'enforce'
    await expect(getBillingMode()).resolves.toBe('ENFORCE')
    expect(getBootBillingEnabled()).toBe(true)
  })

  it('falls back to OFF when env mode is invalid', async () => {
    process.env.BILLING_MODE = 'invalid'
    await expect(getBillingMode()).resolves.toBe('OFF')
    expect(getBootBillingEnabled()).toBe(false)
  })
})
