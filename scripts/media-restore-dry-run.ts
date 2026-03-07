import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { prisma } from '@/lib/prisma'

const BACKUP_ROOT = path.join(process.cwd(), 'data', 'migration-backups')

type CountMap = Record<string, number>

async function findLatestBackupDir() {
  const exists = await fs.stat(BACKUP_ROOT).then(() => true).catch(() => false)
  if (!exists) {
    throw new Error(`Backup root not found: ${BACKUP_ROOT}`)
  }
  const dirs = (await fs.readdir(BACKUP_ROOT, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
  const validDirs: string[] = []
  for (const dir of dirs) {
    const metadataPath = path.join(BACKUP_ROOT, dir, 'metadata.json')
    const exists = await fs.stat(metadataPath).then(() => true).catch(() => false)
    if (exists) validDirs.push(dir)
  }

  if (!validDirs.length) {
    throw new Error(`No backup directories found in ${BACKUP_ROOT}`)
  }
  return path.join(BACKUP_ROOT, validDirs[validDirs.length - 1])
}

async function readExpectedCounts(backupDir: string): Promise<CountMap> {
  const metadataPath = path.join(backupDir, 'metadata.json')
  const raw = await fs.readFile(metadataPath, 'utf8')
  const parsed = JSON.parse(raw)
  return (parsed.tableCounts || {}) as CountMap
}

async function currentCounts(): Promise<CountMap> {
  const entries: Array<[string, string]> = [
    ['projects', 'projects'],
    ['novel_promotion_projects', 'novel_promotion_projects'],
    ['novel_promotion_episodes', 'novel_promotion_episodes'],
    ['novel_promotion_panels', 'novel_promotion_panels'],
    ['novel_promotion_voice_lines', 'novel_promotion_voice_lines'],
    ['global_characters', 'global_characters'],
    ['global_character_appearances', 'global_character_appearances'],
    ['global_locations', 'global_locations'],
    ['global_location_images', 'global_location_images'],
    ['global_voices', 'global_voices'],
    ['tasks', 'tasks'],
    ['task_events', 'task_events'],
  ]

  const resolved = await Promise.all(entries.map(async ([name, tableName]) => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS c FROM \`${tableName}\``,
    )) as Array<Record<string, unknown>>
    const raw = rows[0] || {}
    const firstValue = Object.values(raw)[0]
    const count = Number(firstValue || 0)
    return [name, Number.isFinite(count) ? count : 0] as const
  }))
  const out: CountMap = {}
  for (const [name, count] of resolved) out[name] = count
  return out
}

function printDiff(expected: CountMap, actual: CountMap) {
  const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort()
  let hasDiff = false

  _ulogInfo('table\texpected\tactual\tdelta')
  for (const key of keys) {
    const e = expected[key] ?? 0
    const a = actual[key] ?? 0
    const d = a - e
    if (d !== 0) hasDiff = true
    _ulogInfo(`${key}\t${e}\t${a}\t${d >= 0 ? '+' : ''}${d}`)
  }

  return hasDiff
}

async function main() {
  const explicit = process.argv.find((arg) => arg.startsWith('--backup='))
  const backupDir = explicit ? path.resolve(explicit.split('=')[1]) : await findLatestBackupDir()

  _ulogInfo(`[media-restore-dry-run] backupDir=${backupDir}`)

  const expected = await readExpectedCounts(backupDir)
  const actual = await currentCounts()
  const hasDiff = printDiff(expected, actual)

  if (hasDiff) {
    _ulogInfo('[media-restore-dry-run] drift detected (dry-run only, no writes executed).')
    process.exitCode = 2
    return
  }

  _ulogInfo('[media-restore-dry-run] ok: counts match expected snapshot.')
}

main()
  .catch((error) => {
    _ulogError('[media-restore-dry-run] failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
