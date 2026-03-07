import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { prisma } from '@/lib/prisma'
import { MEDIA_MODEL_MAPPINGS } from './media-mapping'

const BACKUP_ROOT = path.join(process.cwd(), 'data', 'migration-backups')
const BATCH_SIZE = 500
type DynamicModel = {
  findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>
  createMany?: (args: unknown) => Promise<unknown>
}
const prismaDynamic = prisma as unknown as Record<string, DynamicModel>

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function checksum(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function toSelect(fields: string[]) {
  const select: Record<string, true> = { id: true }
  for (const field of fields) select[field] = true
  return select
}

async function main() {
  const runId = nowStamp()
  const backupDir = path.join(BACKUP_ROOT, runId)
  await fs.mkdir(backupDir, { recursive: true })

  const allRows: Array<{
    runId: string
    tableName: string
    rowId: string
    fieldName: string
    legacyValue: string
    checksum: string
  }> = []

  for (const mapping of MEDIA_MODEL_MAPPINGS) {
    const model = prismaDynamic[mapping.model]
    if (!model) continue

    const select = toSelect(mapping.fields.map((f) => f.legacyField))
    let cursor: string | null = null

    while (true) {
      const page = await model.findMany({
        select,
        ...(cursor
          ? {
            cursor: { id: cursor },
            skip: 1,
          }
          : {}),
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
      })
      if (!page.length) break

      for (const row of page) {
        for (const field of mapping.fields) {
          const value = row[field.legacyField]
          if (typeof value !== 'string' || !value.trim()) continue
          allRows.push({
            runId,
            tableName: mapping.tableName,
            rowId: String(row.id),
            fieldName: field.legacyField,
            legacyValue: value,
            checksum: checksum(value),
          })
        }
      }

      cursor = String(page[page.length - 1].id)
    }
  }

  if (allRows.length > 0) {
    try {
      const backupModel = prismaDynamic.legacyMediaRefBackup
      if (!backupModel?.createMany) {
        throw new Error('Prisma model not found: legacyMediaRefBackup')
      }
      for (let i = 0; i < allRows.length; i += 1000) {
        const chunk = allRows.slice(i, i + 1000)
        await backupModel.createMany({ data: chunk })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      _ulogError('[media-archive-legacy-refs] db backup table unavailable, fallback to file snapshot only', message)
    }
  }

  const snapshotPath = path.join(backupDir, 'legacy-media-refs.json')
  await fs.writeFile(snapshotPath, JSON.stringify(allRows, null, 2), 'utf8')
  const snapshotHash = checksum(await fs.readFile(snapshotPath, 'utf8'))

  const summary = {
    runId,
    createdAt: new Date().toISOString(),
    backupDir,
    archivedCount: allRows.length,
    snapshotFile: path.basename(snapshotPath),
    snapshotSha256: snapshotHash,
  }

  await fs.writeFile(path.join(backupDir, 'legacy-media-refs-summary.json'), JSON.stringify(summary, null, 2), 'utf8')

  _ulogInfo(`[media-archive-legacy-refs] runId=${runId}`)
  _ulogInfo(`[media-archive-legacy-refs] archived=${allRows.length}`)
  _ulogInfo(`[media-archive-legacy-refs] snapshot=${snapshotPath}`)
}

main()
  .catch((error) => {
    _ulogError('[media-archive-legacy-refs] failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
