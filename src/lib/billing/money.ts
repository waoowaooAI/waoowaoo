import { Prisma } from '@prisma/client'

export type MoneyValue = Prisma.Decimal | number | string | null | undefined

export function toMoneyNumber(value: MoneyValue): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (value instanceof Prisma.Decimal) {
    return value.toNumber()
  }
  const decimalLike = value as { toNumber?: () => number; toString?: () => string }
  if (typeof decimalLike.toNumber === 'function') {
    const parsed = decimalLike.toNumber()
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (typeof decimalLike.toString === 'function') {
    const parsed = Number(decimalLike.toString())
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

export function roundMoney(value: number, scale = 6): number {
  const factor = Math.pow(10, scale)
  return Math.round(value * factor) / factor
}
