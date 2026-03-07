import { expect } from 'vitest'
import { prisma } from './prisma'
import { toMoneyNumber } from '@/lib/billing/money'

export async function expectBalance(userId: string, params: {
  balance: number
  frozenAmount: number
  totalSpent: number
}) {
  const row = await prisma.userBalance.findUnique({ where: { userId } })
  expect(row).toBeTruthy()
  expect(toMoneyNumber(row!.balance)).toBeCloseTo(params.balance, 8)
  expect(toMoneyNumber(row!.frozenAmount)).toBeCloseTo(params.frozenAmount, 8)
  expect(toMoneyNumber(row!.totalSpent)).toBeCloseTo(params.totalSpent, 8)
}

export async function expectNoNegativeLedger(userId: string) {
  const row = await prisma.userBalance.findUnique({ where: { userId } })
  expect(row).toBeTruthy()
  expect(toMoneyNumber(row!.balance)).toBeGreaterThanOrEqual(0)
  expect(toMoneyNumber(row!.frozenAmount)).toBeGreaterThanOrEqual(0)
  expect(toMoneyNumber(row!.totalSpent)).toBeGreaterThanOrEqual(0)
}
