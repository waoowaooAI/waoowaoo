import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
import { prisma } from '@/lib/prisma'

function parseMinutesArg() {
  const raw = process.argv.find((arg) => arg.startsWith('--minutes='))
  const value = raw ? Number.parseInt(raw.split('=')[1], 10) : 5
  return Number.isFinite(value) && value > 0 ? value : 5
}

async function main() {
  const minutes = parseMinutesArg()
  const since = new Date(Date.now() - minutes * 60_000)

  const rows = await prisma.task.groupBy({
    by: ['errorCode'],
    where: {
      status: 'failed',
      finishedAt: { gte: since },
    },
    _count: {
      _all: true,
    },
    orderBy: {
      _count: {
        errorCode: 'desc',
      },
    },
  })

  const total = rows.reduce((sum: number, row) => sum + (row._count?._all || 0), 0)

  _ulogInfo(`[TaskErrorStats] window=${minutes}m failed_total=${total}`)
  if (!rows.length) {
    _ulogInfo('No failed tasks in the selected window.')
    return
  }

  for (const row of rows) {
    const code = row.errorCode || 'UNKNOWN'
    const count = row?._count?._all || 0
    const ratio = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0'
    _ulogInfo(`${code}\t${count}\t${ratio}%`)
  }
}

main()
  .catch((error) => {
    _ulogError('[TaskErrorStats] failed:', error?.message || error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
