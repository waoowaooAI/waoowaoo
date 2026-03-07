import { beforeEach, describe, expect, it } from 'vitest'
import {
  confirmChargeWithRecord,
  freezeBalance,
  getBalance,
  recordShadowUsage,
  rollbackFreeze,
} from '@/lib/billing/ledger'
import { prisma } from '../../helpers/prisma'
import { resetBillingState } from '../../helpers/db-reset'
import { createTestProject, createTestUser, seedBalance } from '../../helpers/billing-fixtures'

describe('billing/ledger integration', () => {
  beforeEach(async () => {
    await resetBillingState()
    process.env.BILLING_MODE = 'ENFORCE'
  })

  it('freezes balance when enough funds exist', async () => {
    const user = await createTestUser()
    await seedBalance(user.id, 10)

    const freezeId = await freezeBalance(user.id, 3, { idempotencyKey: 'freeze_ok' })
    expect(freezeId).toBeTruthy()

    const balance = await getBalance(user.id)
    expect(balance.balance).toBeCloseTo(7, 8)
    expect(balance.frozenAmount).toBeCloseTo(3, 8)
  })

  it('returns null freeze id when balance is insufficient', async () => {
    const user = await createTestUser()
    await seedBalance(user.id, 1)

    const freezeId = await freezeBalance(user.id, 3, { idempotencyKey: 'freeze_no_money' })
    expect(freezeId).toBeNull()
  })

  it('reuses same freeze record with the same idempotency key', async () => {
    const user = await createTestUser()
    await seedBalance(user.id, 10)

    const first = await freezeBalance(user.id, 2, { idempotencyKey: 'idem_key' })
    const second = await freezeBalance(user.id, 2, { idempotencyKey: 'idem_key' })

    expect(first).toBeTruthy()
    expect(second).toBe(first)

    const balance = await getBalance(user.id)
    expect(balance.balance).toBeCloseTo(8, 8)
    expect(balance.frozenAmount).toBeCloseTo(2, 8)
    expect(await prisma.balanceFreeze.count()).toBe(1)
  })

  it('supports partial confirmation and refunds difference', async () => {
    const user = await createTestUser()
    const project = await createTestProject(user.id)
    await seedBalance(user.id, 10)

    const freezeId = await freezeBalance(user.id, 3, { idempotencyKey: 'confirm_partial' })
    expect(freezeId).toBeTruthy()

    const confirmed = await confirmChargeWithRecord(
      freezeId!,
      {
        projectId: project.id,
        action: 'integration_confirm',
        apiType: 'voice',
        model: 'index-tts2',
        quantity: 2,
        unit: 'second',
      },
      { chargedAmount: 2 },
    )
    expect(confirmed).toBe(true)

    const balance = await getBalance(user.id)
    expect(balance.balance).toBeCloseTo(8, 8)
    expect(balance.frozenAmount).toBeCloseTo(0, 8)
    expect(balance.totalSpent).toBeCloseTo(2, 8)
    expect(await prisma.usageCost.count()).toBe(1)
  })

  it('is idempotent when confirm is called repeatedly', async () => {
    const user = await createTestUser()
    const project = await createTestProject(user.id)
    await seedBalance(user.id, 10)

    const freezeId = await freezeBalance(user.id, 2, { idempotencyKey: 'confirm_idem' })
    expect(freezeId).toBeTruthy()

    const first = await confirmChargeWithRecord(
      freezeId!,
      {
        projectId: project.id,
        action: 'integration_confirm',
        apiType: 'image',
        model: 'seedream',
        quantity: 1,
        unit: 'image',
      },
      { chargedAmount: 1 },
    )
    const second = await confirmChargeWithRecord(
      freezeId!,
      {
        projectId: project.id,
        action: 'integration_confirm',
        apiType: 'image',
        model: 'seedream',
        quantity: 1,
        unit: 'image',
      },
      { chargedAmount: 1 },
    )

    expect(first).toBe(true)
    expect(second).toBe(true)
    expect(await prisma.balanceTransaction.count({ where: { freezeId: freezeId! } })).toBe(1)
  })

  it('rolls back pending freeze and restores funds', async () => {
    const user = await createTestUser()
    await seedBalance(user.id, 10)

    const freezeId = await freezeBalance(user.id, 4, { idempotencyKey: 'rollback_ok' })
    expect(freezeId).toBeTruthy()

    const rolled = await rollbackFreeze(freezeId!)
    expect(rolled).toBe(true)

    const balance = await getBalance(user.id)
    expect(balance.balance).toBeCloseTo(10, 8)
    expect(balance.frozenAmount).toBeCloseTo(0, 8)
  })

  it('returns false when trying to rollback a non-pending freeze', async () => {
    const user = await createTestUser()
    const project = await createTestProject(user.id)
    await seedBalance(user.id, 10)

    const freezeId = await freezeBalance(user.id, 2, { idempotencyKey: 'rollback_after_confirm' })
    expect(freezeId).toBeTruthy()

    await confirmChargeWithRecord(
      freezeId!,
      {
        projectId: project.id,
        action: 'integration_confirm',
        apiType: 'voice',
        model: 'index-tts2',
        quantity: 5,
        unit: 'second',
      },
      { chargedAmount: 1 },
    )

    const rolled = await rollbackFreeze(freezeId!)
    expect(rolled).toBe(false)
  })

  it('records shadow usage as audit transaction without balance change', async () => {
    const user = await createTestUser()
    await seedBalance(user.id, 5)

    const ok = await recordShadowUsage(user.id, {
      projectId: 'asset-hub',
      action: 'shadow_test',
      apiType: 'text',
      model: 'anthropic/claude-sonnet-4',
      quantity: 1200,
      unit: 'token',
      cost: 0.25,
      metadata: { source: 'test' },
    })
    expect(ok).toBe(true)

    const balance = await getBalance(user.id)
    expect(balance.balance).toBeCloseTo(5, 8)
    expect(balance.totalSpent).toBeCloseTo(0, 8)
    expect(await prisma.balanceTransaction.count({ where: { type: 'shadow_consume' } })).toBe(1)
  })
})
