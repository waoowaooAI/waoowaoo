import { prisma } from '@/lib/prisma'
import { roundMoney, toMoneyNumber } from '@/lib/billing/money'

type UserLedgerRow = {
  userId: string
  balance: number
  frozenAmount: number
  txNetAmount: number
  ledgerAmount: number
  diff: number
}

function hasStrictFlag() {
  return process.argv.includes('--strict')
}

function write(payload: unknown) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}

async function main() {
  const strict = hasStrictFlag()

  const [balances, txByUser, pendingFreezes] = await Promise.all([
    prisma.userBalance.findMany({
      select: {
        userId: true,
        balance: true,
        frozenAmount: true,
      },
    }),
    prisma.balanceTransaction.groupBy({
      by: ['userId'],
      _sum: { amount: true },
    }),
    prisma.balanceFreeze.findMany({
      where: { status: 'pending' },
      select: {
        id: true,
        userId: true,
        taskId: true,
        amount: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const txNetByUser = new Map<string, number>()
  for (const row of txByUser) {
    txNetByUser.set(row.userId, roundMoney(toMoneyNumber(row._sum.amount), 8))
  }

  const ledgerRows: UserLedgerRow[] = balances.map((row) => {
    const balance = toMoneyNumber(row.balance)
    const frozenAmount = toMoneyNumber(row.frozenAmount)
    const txNetAmount = roundMoney(txNetByUser.get(row.userId) || 0, 8)
    const ledgerAmount = roundMoney(balance + frozenAmount, 8)
    return {
      userId: row.userId,
      balance,
      frozenAmount,
      txNetAmount,
      ledgerAmount,
      diff: roundMoney(ledgerAmount - txNetAmount, 8),
    }
  })

  const nonZeroDiffUsers = ledgerRows.filter((row) => Math.abs(row.diff) > 1e-8)

  const pendingTaskIds = pendingFreezes
    .map((row) => row.taskId)
    .filter((taskId): taskId is string => typeof taskId === 'string' && taskId.length > 0)
  const tasks = pendingTaskIds.length > 0
    ? await prisma.task.findMany({
      where: { id: { in: pendingTaskIds } },
      select: { id: true, status: true },
    })
    : []
  const taskStatusById = new Map(tasks.map((row) => [row.id, row.status]))
  const activeStatuses = new Set(['queued', 'processing'])
  const orphanPendingFreezes = pendingFreezes.filter((freeze) => {
    if (!freeze.taskId) return true
    const status = taskStatusById.get(freeze.taskId)
    if (!status) return true
    return !activeStatuses.has(status)
  })

  const result = {
    strict,
    checkedAt: new Date().toISOString(),
    totals: {
      users: balances.length,
      txUsers: txByUser.length,
      pendingFreezes: pendingFreezes.length,
      nonZeroDiffUsers: nonZeroDiffUsers.length,
      orphanPendingFreezes: orphanPendingFreezes.length,
    },
    nonZeroDiffUsers,
    orphanPendingFreezes: orphanPendingFreezes.map((row) => ({
      id: row.id,
      userId: row.userId,
      taskId: row.taskId,
      amount: toMoneyNumber(row.amount),
      createdAt: row.createdAt.toISOString(),
    })),
  }

  write(result)

  if (strict && (nonZeroDiffUsers.length > 0 || orphanPendingFreezes.length > 0)) {
    process.exitCode = 1
  }
}

main()
  .catch((error) => {
    write({
      error: error instanceof Error ? error.message : String(error),
    })
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
