import { prisma } from '@/lib/prisma'
import { toMoneyNumber } from '@/lib/billing/money'

type CleanupStats = {
  scanned: number
  stale: number
  rolledBack: number
  skipped: number
  errors: number
}

function hasApplyFlag() {
  return process.argv.includes('--apply')
}

function parseHoursArg(defaultHours: number) {
  const arg = process.argv.find((item) => item.startsWith('--hours='))
  if (!arg) return defaultHours
  const value = Number(arg.slice('--hours='.length))
  if (!Number.isFinite(value) || value <= 0) return defaultHours
  return Math.floor(value)
}

function writeJson(payload: unknown) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}

function writeError(payload: unknown) {
  process.stderr.write(`${typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)}\n`)
}

async function main() {
  const apply = hasApplyFlag()
  const hours = parseHoursArg(24)
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000)

  const pending = await prisma.balanceFreeze.findMany({
    where: {
      status: 'pending',
      createdAt: { lt: cutoff },
    },
    orderBy: { createdAt: 'asc' },
  })

  const stats: CleanupStats = {
    scanned: pending.length,
    stale: pending.length,
    rolledBack: 0,
    skipped: 0,
    errors: 0,
  }

  if (!apply) {
    writeJson({
      mode: 'dry-run',
      hours,
      cutoff: cutoff.toISOString(),
      stalePendingCount: pending.length,
      stalePending: pending.map((f) => ({
        id: f.id,
        userId: f.userId,
        amount: toMoneyNumber(f.amount),
        createdAt: f.createdAt.toISOString(),
      })),
    })
    return
  }

  for (const freeze of pending) {
    try {
      await prisma.$transaction(async (tx) => {
        const current = await tx.balanceFreeze.findUnique({
          where: { id: freeze.id },
        })
        if (!current || current.status !== 'pending') {
          stats.skipped += 1
          return
        }

        const balance = await tx.userBalance.findUnique({
          where: { userId: current.userId },
        })
        if (!balance) {
          stats.skipped += 1
          return
        }

        const frozenAmount = toMoneyNumber(balance.frozenAmount)
        const freezeAmount = toMoneyNumber(current.amount)
        const nextFrozenAmount = Math.max(0, frozenAmount - freezeAmount)
        const frozenDelta = frozenAmount - nextFrozenAmount
        const balanceIncrement = frozenDelta

        await tx.userBalance.update({
          where: { userId: current.userId },
          data: {
            balance: { increment: balanceIncrement },
            frozenAmount: { decrement: frozenDelta },
          },
        })

        await tx.balanceFreeze.update({
          where: { id: current.id },
          data: {
            status: 'rolled_back',
          },
        })
      })
      stats.rolledBack += 1
    } catch (error) {
      stats.errors += 1
      writeError({
        tag: 'billing-cleanup-pending-freezes.rollback_failed',
        freezeId: freeze.id,
        userId: freeze.userId,
        amount: toMoneyNumber(freeze.amount),
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  writeJson({
    mode: 'apply',
    hours,
    cutoff: cutoff.toISOString(),
    stats,
  })
}

main()
  .catch((error) => {
    writeError({
      tag: 'billing-cleanup-pending-freezes.fatal',
      error: error instanceof Error ? error.message : String(error),
    })
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
