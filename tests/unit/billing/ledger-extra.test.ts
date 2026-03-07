import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/logging/core', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
}))

import { addBalance, recordShadowUsage } from '@/lib/billing/ledger'

function buildTxStub() {
  return {
    userBalance: {
      upsert: vi.fn(),
    },
    balanceTransaction: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  }
}

describe('billing/ledger extra', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns false when addBalance amount is invalid', async () => {
    const result = await addBalance('u1', 0)
    expect(result).toBe(false)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('adds recharge balance with string reason', async () => {
    const tx = buildTxStub()
    tx.userBalance.upsert.mockResolvedValue({ balance: 8.5 })
    prismaMock.$transaction.mockImplementation(async (callback: (ctx: typeof tx) => Promise<void>) => {
      await callback(tx)
    })

    const result = await addBalance('u1', 5, 'manual recharge')

    expect(result).toBe(true)
    expect(tx.balanceTransaction.findFirst).not.toHaveBeenCalled()
    expect(tx.userBalance.upsert).toHaveBeenCalledTimes(1)
    expect(tx.balanceTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: 'u1',
        type: 'recharge',
        amount: 5,
      }),
    }))
  })

  it('supports idempotent addBalance and short-circuits duplicate key', async () => {
    const tx = buildTxStub()
    tx.balanceTransaction.findFirst.mockResolvedValue({ id: 'existing_tx' })
    prismaMock.$transaction.mockImplementation(async (callback: (ctx: typeof tx) => Promise<void>) => {
      await callback(tx)
    })

    const result = await addBalance('u1', 3, {
      type: 'adjust',
      reason: 'admin adjust',
      idempotencyKey: 'idem_1',
      operatorId: 'op_1',
      externalOrderId: 'order_1',
    })

    expect(result).toBe(true)
    expect(tx.balanceTransaction.findFirst).toHaveBeenCalledTimes(1)
    expect(tx.userBalance.upsert).not.toHaveBeenCalled()
    expect(tx.balanceTransaction.create).not.toHaveBeenCalled()
  })

  it('returns false when transaction throws in addBalance', async () => {
    prismaMock.$transaction.mockRejectedValue(new Error('db error'))

    const result = await addBalance('u1', 2, 'x')

    expect(result).toBe(false)
  })

  it('records shadow usage consume log on success', async () => {
    const tx = buildTxStub()
    tx.userBalance.upsert.mockResolvedValue({ balance: 11.2 })
    prismaMock.$transaction.mockImplementation(async (callback: (ctx: typeof tx) => Promise<void>) => {
      await callback(tx)
    })

    const result = await recordShadowUsage('u1', {
      projectId: 'p1',
      action: 'analyze',
      apiType: 'text',
      model: 'anthropic/claude-sonnet-4',
      quantity: 1000,
      unit: 'token',
      cost: 0.25,
      metadata: { trace: 'abc' },
    })

    expect(result).toBe(true)
    expect(tx.balanceTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: 'u1',
        type: 'shadow_consume',
        amount: 0,
      }),
    }))
  })

  it('returns false when recordShadowUsage transaction fails', async () => {
    prismaMock.$transaction.mockRejectedValue(new Error('shadow failed'))

    const result = await recordShadowUsage('u1', {
      projectId: 'p1',
      action: 'analyze',
      apiType: 'text',
      model: 'anthropic/claude-sonnet-4',
      quantity: 1000,
      unit: 'token',
      cost: 0.25,
    })

    expect(result).toBe(false)
  })
})

