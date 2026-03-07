import { prisma } from '@/lib/prisma'
import { TASK_STATUS, TASK_TYPE } from '@/lib/task/types'

type StatusCount = Record<string, number>

type WindowSummary = {
  total: number
  finishedTotal: number
  completed: number
  failed: number
  successRate: number | null
  byStatus: StatusCount
  byType: Record<string, number>
}

type Options = {
  minutes: number
  baselineMinutes: number
  baselineOffsetMinutes: number
  projectId: string | null
  tolerancePct: number
  minFinishedSamples: number
  strict: boolean
  json: boolean
}

const DEFAULT_MINUTES = 60 * 24 * 7
const DEFAULT_TOLERANCE_PCT = 2
const DEFAULT_MIN_FINISHED_SAMPLES = 20

function parseNumberArg(name: string, fallback: number): number {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`))
  if (!raw) return fallback
  const value = Number.parseFloat(raw.split('=')[1] || '')
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function parseBooleanArg(name: string, fallback = false): boolean {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`))
  if (!raw) return fallback
  const value = (raw.split('=')[1] || '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function parseStringArg(name: string): string | null {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`))
  if (!raw) return null
  const value = (raw.split('=')[1] || '').trim()
  return value || null
}

function parseOptions(): Options {
  const minutes = parseNumberArg('minutes', DEFAULT_MINUTES)
  const baselineMinutes = parseNumberArg('baselineMinutes', minutes)
  const baselineOffsetMinutes = parseNumberArg('baselineOffsetMinutes', minutes)
  return {
    minutes,
    baselineMinutes,
    baselineOffsetMinutes,
    projectId: parseStringArg('projectId'),
    tolerancePct: parseNumberArg('tolerancePct', DEFAULT_TOLERANCE_PCT),
    minFinishedSamples: parseNumberArg('minFinishedSamples', DEFAULT_MIN_FINISHED_SAMPLES),
    strict: parseBooleanArg('strict', false),
    json: parseBooleanArg('json', false),
  }
}

function asPct(value: number | null): string {
  return value === null ? 'N/A' : `${value.toFixed(2)}%`
}

function getSuccessRate(completed: number, failed: number): number | null {
  const total = completed + failed
  if (total <= 0) return null
  return (completed / total) * 100
}

function summarizeRows(
  rows: Array<{ status: string; type: string }>,
): WindowSummary {
  const byStatus: StatusCount = {}
  const byType: Record<string, number> = {}
  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] || 0) + 1
    byType[row.type] = (byType[row.type] || 0) + 1
  }

  const completed = byStatus[TASK_STATUS.COMPLETED] || 0
  const failed = byStatus[TASK_STATUS.FAILED] || 0
  const finishedTotal = completed + failed

  return {
    total: rows.length,
    finishedTotal,
    completed,
    failed,
    successRate: getSuccessRate(completed, failed),
    byStatus,
    byType,
  }
}

async function fetchWindowSummary(params: {
  from: Date
  to: Date
  projectId: string | null
}) {
  const monitoredTypes = [
    TASK_TYPE.MODIFY_ASSET_IMAGE,
    TASK_TYPE.ASSET_HUB_MODIFY,
    TASK_TYPE.VIDEO_PANEL,
  ]

  const rows = await prisma.task.findMany({
    where: {
      type: { in: monitoredTypes },
      createdAt: {
        gte: params.from,
        lt: params.to,
      },
      ...(params.projectId ? { projectId: params.projectId } : {}),
    },
    select: {
      status: true,
      type: true,
    },
  })

  return summarizeRows(rows)
}

async function main() {
  const options = parseOptions()
  const now = Date.now()

  const currentEnd = new Date(now)
  const currentStart = new Date(now - options.minutes * 60_000)

  const baselineEnd = new Date(now - options.baselineOffsetMinutes * 60_000)
  const baselineStart = new Date(baselineEnd.getTime() - options.baselineMinutes * 60_000)

  const [current, baseline] = await Promise.all([
    fetchWindowSummary({
      from: currentStart,
      to: currentEnd,
      projectId: options.projectId,
    }),
    fetchWindowSummary({
      from: baselineStart,
      to: baselineEnd,
      projectId: options.projectId,
    }),
  ])

  const hasEnoughCurrent = current.finishedTotal >= options.minFinishedSamples
  const hasEnoughBaseline = baseline.finishedTotal >= options.minFinishedSamples
  const hasEnoughSamples = hasEnoughCurrent && hasEnoughBaseline

  const rateDeltaPct =
    current.successRate !== null && baseline.successRate !== null
      ? current.successRate - baseline.successRate
      : null

  const meetsTolerance =
    rateDeltaPct !== null
      ? rateDeltaPct >= -Math.abs(options.tolerancePct)
      : false

  const status = hasEnoughSamples
    ? meetsTolerance
      ? 'pass'
      : 'fail'
    : 'blocked'

  process.stdout.write(
    `[check:outbound-image-success-rate] current=${asPct(current.successRate)} baseline=${asPct(baseline.successRate)} delta=${asPct(rateDeltaPct)} tolerance=-${Math.abs(options.tolerancePct).toFixed(2)}% status=${status}\n`,
  )
  process.stdout.write(
    `[check:outbound-image-success-rate] current_finished=${current.finishedTotal} baseline_finished=${baseline.finishedTotal} min_required=${options.minFinishedSamples}\n`,
  )
  process.stdout.write(
    `[check:outbound-image-success-rate] current_by_type=${JSON.stringify(current.byType)} baseline_by_type=${JSON.stringify(baseline.byType)}\n`,
  )

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({
        status,
        tolerancePct: options.tolerancePct,
        minFinishedSamples: options.minFinishedSamples,
        windows: {
          current: {
            from: currentStart.toISOString(),
            to: currentEnd.toISOString(),
            ...current,
          },
          baseline: {
            from: baselineStart.toISOString(),
            to: baselineEnd.toISOString(),
            ...baseline,
          },
        },
        rateDeltaPct,
        hasEnoughSamples,
      })}\n`,
    )
  }

  if (!options.strict) return

  if (status === 'pass') return
  if (status === 'blocked') process.exit(2)
  process.exit(1)
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`[check:outbound-image-success-rate] failed: ${message}\n`)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
