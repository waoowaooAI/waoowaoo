import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { recordUsageCostOnly, buildBillingMeta } from './reporting'
import type { ApiType, UsageUnit } from './cost'
import { BillingOperationError } from './errors'
import { roundMoney, toMoneyNumber, type MoneyValue } from './money'

type LedgerRecordParams = {
  projectId: string
  action: string
  apiType: ApiType
  model: string
  quantity: number
  unit: UsageUnit
  metadata?: Record<string, unknown>
  episodeId?: string | null
  taskType?: string | null
}

export type FreezeSnapshot = {
  id: string
  userId: string
  amount: number
  status: string
}

type BalanceSnapshot = {
  id: string
  userId: string
  balance: number
  frozenAmount: number
  totalSpent: number
  createdAt: Date
  updatedAt: Date
}

const MONEY_SCALE = 6
const MONEY_EPSILON = 1e-9

function normalizeMoney(value: number): number {
  return roundMoney(value, MONEY_SCALE)
}

function toBalanceSnapshot(balance: {
  id: string
  userId: string
  balance: MoneyValue
  frozenAmount: MoneyValue
  totalSpent: MoneyValue
  createdAt: Date
  updatedAt: Date
}): BalanceSnapshot {
  return {
    id: balance.id,
    userId: balance.userId,
    balance: toMoneyNumber(balance.balance),
    frozenAmount: toMoneyNumber(balance.frozenAmount),
    totalSpent: toMoneyNumber(balance.totalSpent),
    createdAt: balance.createdAt,
    updatedAt: balance.updatedAt,
  }
}

export async function getBalance(userId: string) {
  const balance = await prisma.userBalance.findUnique({
    where: { userId },
  })

  if (!balance) {
    const created = await prisma.userBalance.create({
      data: { userId, balance: 0, frozenAmount: 0, totalSpent: 0 },
    })
    return toBalanceSnapshot(created)
  }

  return toBalanceSnapshot(balance)
}

export async function getFreezeByIdempotencyKey(idempotencyKey: string): Promise<FreezeSnapshot | null> {
  if (!idempotencyKey || !idempotencyKey.trim()) return null
  const freeze = await prisma.balanceFreeze.findUnique({
    where: { idempotencyKey },
    select: {
      id: true,
      userId: true,
      amount: true,
      status: true,
    },
  })
  if (!freeze) return null
  return {
    id: freeze.id,
    userId: freeze.userId,
    amount: toMoneyNumber(freeze.amount),
    status: freeze.status,
  }
}

export async function checkBalance(userId: string, requiredAmount: number): Promise<boolean> {
  const balance = await getBalance(userId)
  return balance.balance >= requiredAmount
}

export async function freezeBalance(
  userId: string,
  amount: number,
  options?: {
    source?: string
    taskId?: string
    requestId?: string
    idempotencyKey?: string
    metadata?: Record<string, unknown>
  },
): Promise<string | null> {
  const normalizedAmount = normalizeMoney(Number(amount))
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    return null
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (options?.idempotencyKey) {
        const existing = await tx.balanceFreeze.findUnique({
          where: { idempotencyKey: options.idempotencyKey },
        })
        if (existing) {
          return existing.id
        }
      }

      const balance = await tx.userBalance.findUnique({ where: { userId } })
      if (!balance) {
        await tx.userBalance.create({
          data: { userId, balance: 0, frozenAmount: 0, totalSpent: 0 },
        })
      }

      const updated = await tx.userBalance.updateMany({
        where: {
          userId,
          balance: { gte: normalizedAmount },
        },
        data: {
          balance: { decrement: normalizedAmount },
          frozenAmount: { increment: normalizedAmount },
        },
      })
      if (updated.count === 0) {
        return null
      }

      const freezeId = `freeze_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
      await tx.balanceFreeze.create({
        data: {
          id: freezeId,
          userId,
          amount: normalizedAmount,
          status: 'pending',
          source: options?.source || 'sync',
          taskId: options?.taskId || null,
          requestId: options?.requestId || null,
          idempotencyKey: options?.idempotencyKey || null,
          metadata: options?.metadata ? JSON.stringify(options.metadata) : null,
        },
      })

      return freezeId
    })

    return result
  } catch (error) {
    if (
      options?.idempotencyKey
      && error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === 'P2002'
    ) {
      const existing = await prisma.balanceFreeze.findUnique({
        where: { idempotencyKey: options.idempotencyKey },
        select: { id: true },
      })
      if (existing?.id) {
        return existing.id
      }
    }
    _ulogError('[Billing] freeze failed:', error)
    return null
  }
}

export async function confirmChargeWithRecord(
  freezeId: string,
  recordParams: LedgerRecordParams,
  options?: {
    chargedAmount?: number
  },
): Promise<boolean> {
  try {
    await prisma.$transaction(async (tx) => {
      const freeze = await tx.balanceFreeze.findUnique({ where: { id: freezeId } })
      if (!freeze) {
        throw new BillingOperationError('BILLING_INVALID_FREEZE', 'Invalid freeze record', { freezeId })
      }
      const freezeAmount = normalizeMoney(toMoneyNumber(freeze.amount))

      if (freeze.status === 'confirmed') {
        return
      }

      if (freeze.status !== 'pending') {
        throw new BillingOperationError('BILLING_FREEZE_NOT_PENDING', 'Freeze is not pending', {
          freezeId,
          status: freeze.status,
        })
      }

      const requested = Number(options?.chargedAmount)
      const chargedAmount = normalizeMoney(Number.isFinite(requested) ? requested : freezeAmount)
      if (chargedAmount < 0 || chargedAmount - freezeAmount > MONEY_EPSILON) {
        throw new BillingOperationError('BILLING_INVALID_CHARGED_AMOUNT', 'Invalid chargedAmount', {
          freezeId,
          chargedAmount,
          freezeAmount,
        })
      }

      const refundAmount = normalizeMoney(Math.max(0, freezeAmount - chargedAmount))

      const switched = await tx.balanceFreeze.updateMany({
        where: {
          id: freezeId,
          status: 'pending',
        },
        data: { status: 'confirmed' },
      })
      if (switched.count === 0) {
        const latest = await tx.balanceFreeze.findUnique({ where: { id: freezeId } })
        if (latest?.status === 'confirmed') {
          return
        }
        throw new BillingOperationError('BILLING_FREEZE_NOT_PENDING', 'Freeze is not pending', {
          freezeId,
          status: latest?.status || null,
        })
      }

      const updatedBalance = await tx.userBalance.update({
        where: { userId: freeze.userId },
        data: {
          frozenAmount: { decrement: freezeAmount },
          totalSpent: { increment: chargedAmount },
          ...(refundAmount > 0 ? { balance: { increment: refundAmount } } : {}),
        },
      })

      if (chargedAmount > 0) {
        await recordUsageCostOnly(tx, {
          ...recordParams,
          userId: freeze.userId,
          cost: chargedAmount,
          balanceAfter: toMoneyNumber(updatedBalance.balance),
          freezeId: freeze.id,
        })
      }
    }, {
      maxWait: 10_000,
      timeout: 10_000,
    })

    return true
  } catch (error) {
    _ulogError('[Billing] confirm charge failed:', error)
    if (error instanceof BillingOperationError) {
      throw error
    }
    if (error instanceof Error) {
      throw new BillingOperationError('BILLING_CONFIRM_FAILED', error.message, { freezeId }, error)
    }
    throw new BillingOperationError('BILLING_CONFIRM_FAILED', `confirm charge failed: ${String(error)}`, { freezeId })
  }
}

export async function rollbackFreeze(freezeId: string): Promise<boolean> {
  try {
    await prisma.$transaction(async (tx) => {
      const freeze = await tx.balanceFreeze.findUnique({ where: { id: freezeId } })
      if (!freeze) {
        throw new Error('Invalid freeze record')
      }
      const freezeAmount = normalizeMoney(toMoneyNumber(freeze.amount))
      if (freeze.status === 'rolled_back') {
        return
      }
      if (freeze.status !== 'pending') {
        throw new Error('Freeze is not pending')
      }

      const switched = await tx.balanceFreeze.updateMany({
        where: {
          id: freezeId,
          status: 'pending',
        },
        data: { status: 'rolled_back' },
      })
      if (switched.count === 0) {
        const latest = await tx.balanceFreeze.findUnique({ where: { id: freezeId } })
        if (latest?.status === 'rolled_back') {
          return
        }
        throw new Error('Freeze is not pending')
      }

      await tx.userBalance.update({
        where: { userId: freeze.userId },
        data: {
          balance: { increment: freezeAmount },
          frozenAmount: { decrement: freezeAmount },
        },
      })
    })

    return true
  } catch (error) {
    _ulogError('[Billing] rollback freeze failed:', error)
    return false
  }
}

export async function increasePendingFreezeAmount(freezeId: string, delta: number): Promise<boolean> {
  const normalizedDelta = normalizeMoney(Number(delta))
  if (!Number.isFinite(normalizedDelta) || normalizedDelta < 0) {
    throw new BillingOperationError('BILLING_INVALID_DELTA', 'delta must be a non-negative number', {
      freezeId,
      delta,
    })
  }
  if (normalizedDelta === 0) {
    return true
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const freeze = await tx.balanceFreeze.findUnique({ where: { id: freezeId } })
      if (!freeze) {
        throw new BillingOperationError('BILLING_INVALID_FREEZE', 'Invalid freeze record', { freezeId })
      }
      if (freeze.status === 'confirmed') {
        return true
      }
      if (freeze.status !== 'pending') {
        throw new BillingOperationError('BILLING_FREEZE_NOT_PENDING', 'Freeze is not pending', {
          freezeId,
          status: freeze.status,
        })
      }

      const updated = await tx.userBalance.updateMany({
        where: {
          userId: freeze.userId,
          balance: { gte: normalizedDelta },
        },
        data: {
          balance: { decrement: normalizedDelta },
          frozenAmount: { increment: normalizedDelta },
        },
      })
      if (updated.count === 0) {
        return false
      }

      const switched = await tx.balanceFreeze.updateMany({
        where: {
          id: freezeId,
          status: 'pending',
        },
        data: {
          amount: { increment: normalizedDelta },
        },
      })
      if (switched.count === 0) {
        throw new BillingOperationError('BILLING_FREEZE_NOT_PENDING', 'Freeze is not pending', { freezeId })
      }
      return true
    })

    return result
  } catch (error) {
    _ulogError('[Billing] increase pending freeze failed:', error)
    if (error instanceof BillingOperationError) {
      throw error
    }
    if (error instanceof Error) {
      throw new BillingOperationError('BILLING_FREEZE_EXPAND_FAILED', error.message, { freezeId, delta: normalizedDelta }, error)
    }
    throw new BillingOperationError('BILLING_FREEZE_EXPAND_FAILED', `increase freeze failed: ${String(error)}`, { freezeId, delta: normalizedDelta })
  }
}

export async function recordShadowUsage(
  userId: string,
  params: {
    projectId: string
    episodeId?: string | null
    taskType?: string | null
    action: string
    apiType: ApiType
    model: string
    quantity: number
    unit: UsageUnit
    cost: number
    metadata?: Record<string, unknown>
  },
): Promise<boolean> {
  try {
    await prisma.$transaction(async (tx) => {
      const balance = await tx.userBalance.upsert({
        where: { userId },
        create: { userId, balance: 0, frozenAmount: 0, totalSpent: 0 },
        update: {},
      })

      const metadataSummary = params.metadata
        ? JSON.stringify(params.metadata).slice(0, 500)
        : ''

      await tx.balanceTransaction.create({
        data: {
          userId,
          type: 'shadow_consume',
          amount: 0,
          balanceAfter: toMoneyNumber(balance.balance),
          description: `[SHADOW] ${params.action} - ${params.model} - ¥${params.cost.toFixed(4)}${metadataSummary ? ` | ${metadataSummary}` : ''}`,
          relatedId: null,
          freezeId: null,
          projectId: params.projectId || null,
          episodeId: params.episodeId || null,
          taskType: params.taskType || params.action || null,
          billingMeta: buildBillingMeta(params),
        },
      })
    })
    return true
  } catch (error) {
    _ulogError('[Billing] record shadow usage failed:', error)
    return false
  }
}

type AddBalanceOptions = {
  reason?: string
  operatorId?: string
  externalOrderId?: string
  idempotencyKey?: string
  type?: 'recharge' | 'adjust'
}

function resolveAddBalanceOptions(reasonOrOptions?: string | AddBalanceOptions): AddBalanceOptions {
  if (typeof reasonOrOptions === 'string') {
    return { reason: reasonOrOptions, type: 'recharge' }
  }
  return {
    reason: reasonOrOptions?.reason,
    operatorId: reasonOrOptions?.operatorId,
    externalOrderId: reasonOrOptions?.externalOrderId,
    idempotencyKey: reasonOrOptions?.idempotencyKey,
    type: reasonOrOptions?.type || 'recharge',
  }
}

export async function addBalance(userId: string, amount: number, reasonOrOptions?: string | AddBalanceOptions): Promise<boolean> {
  try {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('amount must be a positive number')
    }
    const options = resolveAddBalanceOptions(reasonOrOptions)
    const relatedId = options.externalOrderId || null

    await prisma.$transaction(async (tx) => {
      if (options.idempotencyKey) {
        const existing = await tx.balanceTransaction.findFirst({
          where: {
            userId,
            type: options.type || 'recharge',
            idempotencyKey: options.idempotencyKey,
          },
          select: { id: true },
        })
        if (existing) {
          return
        }
      }

      const updatedBalance = await tx.userBalance.upsert({
        where: { userId },
        create: { userId, balance: amount, frozenAmount: 0, totalSpent: 0 },
        update: { balance: { increment: amount } },
      })

      const auditSummary = JSON.stringify({
        reason: options.reason || null,
        operatorId: options.operatorId || null,
        externalOrderId: options.externalOrderId || null,
        idempotencyKey: options.idempotencyKey || null,
      })

      await tx.balanceTransaction.create({
        data: {
          userId,
          type: options.type || 'recharge',
          amount,
          balanceAfter: toMoneyNumber(updatedBalance.balance),
          description: `${options.reason || 'balance recharge'}${auditSummary ? ` | audit=${auditSummary}` : ''}`,
          relatedId,
          freezeId: null,
          operatorId: options.operatorId || null,
          externalOrderId: options.externalOrderId || null,
          idempotencyKey: options.idempotencyKey || null,
        },
      })
    })

    _ulogInfo(`[Balance] add balance success: userId=${userId}, amount=¥${amount}, reason=${options.reason || 'N/A'}`)
    return true
  } catch (error) {
    _ulogError('[Balance] add balance failed:', error)
    return false
  }
}
