import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
import { prisma } from '@/lib/prisma'
import { resolveMediaRefFromLegacyValue } from '@/lib/media/service'
import { MEDIA_MODEL_MAPPINGS } from './media-mapping'

const BATCH_SIZE = 200
type DynamicModel = {
  findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>
  update: (args: unknown) => Promise<unknown>
}
const prismaDynamic = prisma as unknown as Record<string, DynamicModel>

function toSelect(fields: string[]) {
  const select: Record<string, true> = { id: true }
  for (const field of fields) select[field] = true
  return select
}

async function backfillModel(mapping: (typeof MEDIA_MODEL_MAPPINGS)[number]) {
  const model = prismaDynamic[mapping.model]
  if (!model) {
    throw new Error(`Prisma model not found: ${mapping.model}`)
  }

  const selectFields = mapping.fields.flatMap((f) => [f.legacyField, f.mediaIdField])
  const select = toSelect(selectFields)

  let cursor: string | null = null
  let scanned = 0
  let updated = 0

  try {
    while (true) {
      const rows = await model.findMany({
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

      if (!rows.length) break

      for (const row of rows) {
        scanned += 1
        const patch: Record<string, string> = {}

        for (const field of mapping.fields) {
          const mediaId = row[field.mediaIdField]
          const legacyValue = row[field.legacyField]
          if (mediaId || typeof legacyValue !== 'string' || !legacyValue.trim()) {
            continue
          }

          const media = await resolveMediaRefFromLegacyValue(legacyValue)
          if (!media) continue
          patch[field.mediaIdField] = media.id
        }

        if (Object.keys(patch).length > 0) {
          await model.update({
            where: { id: String(row.id) },
            data: patch,
          })
          updated += 1
        }
      }

      cursor = String(rows[rows.length - 1].id)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('does not exist') || message.includes('Unknown column')) {
      _ulogError(
        `[media-backfill-refs] skip ${mapping.tableName}: migration columns not available yet`,
        message,
      )
      return { scanned: 0, updated: 0, skipped: true }
    }
    throw error
  }

  return { scanned, updated, skipped: false }
}

async function main() {
  const startedAt = new Date()
  _ulogInfo(`[media-backfill-refs] started at ${startedAt.toISOString()}`)

  let totalScanned = 0
  let totalUpdated = 0

  for (const mapping of MEDIA_MODEL_MAPPINGS) {
    const result = await backfillModel(mapping)
    totalScanned += result.scanned
    totalUpdated += result.updated
    if (result.skipped) {
      _ulogInfo(`[media-backfill-refs] ${mapping.tableName}: skipped (run add-only DB migration first)`)
    } else {
      _ulogInfo(
        `[media-backfill-refs] ${mapping.tableName}: scanned=${result.scanned} updatedRows=${result.updated}`,
      )
    }
  }

  _ulogInfo(
    `[media-backfill-refs] done scanned=${totalScanned} updatedRows=${totalUpdated} durationMs=${Date.now() - startedAt.getTime()}`,
  )
}

main()
  .catch((error) => {
    _ulogError('[media-backfill-refs] failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
