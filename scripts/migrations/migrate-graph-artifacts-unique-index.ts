import { prisma } from '@/lib/prisma'

const APPLY = process.argv.includes('--apply')
const REQUIRED_INDEX_NAME = 'graph_artifacts_runId_stepKey_artifactType_refId_key'
const REQUIRED_COLUMNS = ['runId', 'stepKey', 'artifactType', 'refId'] as const

type IndexRow = {
  Key_name: string
  Non_unique: number | string
  Seq_in_index: number | string
  Column_name: string
}

type DuplicateRow = {
  runId: string
  stepKey: string
  artifactType: string
  refId: string
  c: bigint | number
}

type MigrationSummary = {
  mode: 'dry-run' | 'apply'
  hasRequiredIndexBefore: boolean
  duplicateGroupCount: number
  duplicateSamples: Array<{
    runId: string
    stepKey: string
    artifactType: string
    refId: string
    count: number
  }>
  altered: boolean
  hasRequiredIndexAfter: boolean
}

function parseIntSafe(value: number | string) {
  if (typeof value === 'number') return value
  return Number.parseInt(value, 10)
}

function hasRequiredUniqueIndex(rows: IndexRow[]) {
  const grouped = new Map<string, Array<{ seq: number; column: string; nonUnique: number }>>()
  for (const row of rows) {
    const seq = parseIntSafe(row.Seq_in_index)
    const nonUnique = parseIntSafe(row.Non_unique)
    if (!Number.isFinite(seq) || !Number.isFinite(nonUnique)) continue
    const key = row.Key_name
    const items = grouped.get(key) || []
    items.push({
      seq,
      column: row.Column_name,
      nonUnique,
    })
    grouped.set(key, items)
  }

  for (const [key, entries] of grouped.entries()) {
    if (entries.length !== REQUIRED_COLUMNS.length) continue
    const sorted = entries.sort((a, b) => a.seq - b.seq)
    if (sorted[0]?.nonUnique !== 0) continue
    const columns = sorted.map((entry) => entry.column)
    const isTarget = columns.every((column, index) => column === REQUIRED_COLUMNS[index])
    if (isTarget && key === REQUIRED_INDEX_NAME) return true
    if (isTarget) return true
  }
  return false
}

function toNumber(value: bigint | number) {
  if (typeof value === 'bigint') return Number(value)
  return value
}

async function loadIndexRows() {
  return await prisma.$queryRawUnsafe<IndexRow[]>('SHOW INDEX FROM graph_artifacts')
}

async function loadDuplicateGroups() {
  return await prisma.$queryRawUnsafe<DuplicateRow[]>(
    `SELECT runId, stepKey, artifactType, refId, COUNT(*) AS c
     FROM graph_artifacts
     WHERE stepKey IS NOT NULL
     GROUP BY runId, stepKey, artifactType, refId
     HAVING c > 1
     LIMIT 20`,
  )
}

async function main() {
  const beforeRows = await loadIndexRows()
  const hasBefore = hasRequiredUniqueIndex(beforeRows)
  const duplicates = await loadDuplicateGroups()

  const summary: MigrationSummary = {
    mode: APPLY ? 'apply' : 'dry-run',
    hasRequiredIndexBefore: hasBefore,
    duplicateGroupCount: duplicates.length,
    duplicateSamples: duplicates.map((row) => ({
      runId: row.runId,
      stepKey: row.stepKey,
      artifactType: row.artifactType,
      refId: row.refId,
      count: toNumber(row.c),
    })),
    altered: false,
    hasRequiredIndexAfter: hasBefore,
  }

  if (hasBefore) {
    console.log(JSON.stringify(summary, null, 2))
    return
  }

  if (duplicates.length > 0) {
    throw new Error(
      `cannot add unique index; found ${duplicates.length} duplicate groups in graph_artifacts (stepKey IS NOT NULL)`,
    )
  }

  if (APPLY) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE graph_artifacts
       ADD UNIQUE INDEX ${REQUIRED_INDEX_NAME} (runId, stepKey, artifactType, refId)`,
    )
    summary.altered = true
    const afterRows = await loadIndexRows()
    summary.hasRequiredIndexAfter = hasRequiredUniqueIndex(afterRows)
    if (!summary.hasRequiredIndexAfter) {
      throw new Error('unique index create verification failed')
    }
  }

  console.log(JSON.stringify(summary, null, 2))
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error: unknown) => {
    console.error('[migrate-graph-artifacts-unique-index] failed', error)
    await prisma.$disconnect()
    process.exit(1)
  })
