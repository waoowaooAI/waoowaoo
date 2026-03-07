import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
import { prisma } from '@/lib/prisma'
import { encodeImageUrls } from '@/lib/contracts/image-urls-contract'

type AppearanceRow = {
  id: string
  imageUrls: string | null
  previousImageUrls: string | null
}

type DynamicModel = {
  findMany: (args: unknown) => Promise<AppearanceRow[]>
  update: (args: unknown) => Promise<unknown>
}

type FieldName = 'imageUrls' | 'previousImageUrls'

type NormalizeResult = {
  next: string
  changed: boolean
  reason: 'ok' | 'null' | 'invalid_json' | 'not_array' | 'filtered_non_string' | 'normalized_json'
}

type ModelStats = {
  scanned: number
  updatedRows: number
  changedFields: number
  reasons: Record<string, number>
}

const BATCH_SIZE = 200
const APPLY = process.argv.includes('--apply')

const MODELS: Array<{ name: string; model: string }> = [
  { name: 'CharacterAppearance', model: 'characterAppearance' },
  { name: 'GlobalCharacterAppearance', model: 'globalCharacterAppearance' },
]

const prismaDynamic = prisma as unknown as Record<string, DynamicModel>

function print(message: string) {
  process.stdout.write(`${message}\n`)
}

function normalizeField(raw: string | null): NormalizeResult {
  if (raw === null) {
    return {
      next: encodeImageUrls([]),
      changed: true,
      reason: 'null',
    }
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return {
        next: encodeImageUrls([]),
        changed: true,
        reason: 'not_array',
      }
    }

    const stringOnly = parsed.filter((item): item is string => typeof item === 'string')
    const next = encodeImageUrls(stringOnly)

    if (parsed.length !== stringOnly.length) {
      return {
        next,
        changed: true,
        reason: 'filtered_non_string',
      }
    }

    if (raw !== next) {
      return {
        next,
        changed: true,
        reason: 'normalized_json',
      }
    }

    return {
      next,
      changed: false,
      reason: 'ok',
    }
  } catch {
    return {
      next: encodeImageUrls([]),
      changed: true,
      reason: 'invalid_json',
    }
  }
}

async function migrateModel(modelName: string, modelKey: string) {
  const model = prismaDynamic[modelKey]
  if (!model) {
    throw new Error(`Prisma model not found: ${modelKey}`)
  }

  const stats: ModelStats = {
    scanned: 0,
    updatedRows: 0,
    changedFields: 0,
    reasons: {
      ok: 0,
      null: 0,
      invalid_json: 0,
      not_array: 0,
      filtered_non_string: 0,
      normalized_json: 0,
    },
  }

  const samples: Array<{ id: string; field: FieldName; reason: NormalizeResult['reason']; before: string | null; after: string }> = []

  let cursor: string | null = null

  while (true) {
    const rows = await model.findMany({
      select: {
        id: true,
        imageUrls: true,
        previousImageUrls: true,
      },
      ...(cursor
        ? {
          cursor: { id: cursor },
          skip: 1,
        }
        : {}),
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    })

    if (rows.length === 0) break

    for (const row of rows) {
      stats.scanned += 1

      const imageUrlsResult = normalizeField(row.imageUrls)
      const previousImageUrlsResult = normalizeField(row.previousImageUrls)

      stats.reasons[imageUrlsResult.reason] += 1
      stats.reasons[previousImageUrlsResult.reason] += 1

      const data: Partial<Record<FieldName, string>> = {}

      if (imageUrlsResult.changed) {
        data.imageUrls = imageUrlsResult.next
        stats.changedFields += 1
        if (samples.length < 20) {
          samples.push({
            id: row.id,
            field: 'imageUrls',
            reason: imageUrlsResult.reason,
            before: row.imageUrls,
            after: imageUrlsResult.next,
          })
        }
      }

      if (previousImageUrlsResult.changed) {
        data.previousImageUrls = previousImageUrlsResult.next
        stats.changedFields += 1
        if (samples.length < 20) {
          samples.push({
            id: row.id,
            field: 'previousImageUrls',
            reason: previousImageUrlsResult.reason,
            before: row.previousImageUrls,
            after: previousImageUrlsResult.next,
          })
        }
      }

      if (Object.keys(data).length > 0) {
        stats.updatedRows += 1
        if (APPLY) {
          await model.update({
            where: { id: row.id },
            data,
          })
        }
      }
    }

    cursor = rows[rows.length - 1]?.id || null
  }

  const summary = `[migrate-image-urls-contract] ${modelName}: scanned=${stats.scanned} updatedRows=${stats.updatedRows} changedFields=${stats.changedFields}`
  _ulogInfo(summary)
  print(summary)
  print(`[migrate-image-urls-contract] ${modelName}: reasons=${JSON.stringify(stats.reasons)}`)

  if (samples.length > 0) {
    print(`[migrate-image-urls-contract] ${modelName}: sampleChanges=${JSON.stringify(samples, null, 2)}`)
  }

  return stats
}

async function main() {
  print(`[migrate-image-urls-contract] mode=${APPLY ? 'apply' : 'dry-run'}`)

  const totals = {
    scanned: 0,
    updatedRows: 0,
    changedFields: 0,
  }

  for (const target of MODELS) {
    const stats = await migrateModel(target.name, target.model)
    totals.scanned += stats.scanned
    totals.updatedRows += stats.updatedRows
    totals.changedFields += stats.changedFields
  }

  print(`[migrate-image-urls-contract] done scanned=${totals.scanned} updatedRows=${totals.updatedRows} changedFields=${totals.changedFields} mode=${APPLY ? 'apply' : 'dry-run'}`)
}

main()
  .catch((error) => {
    _ulogError('[migrate-image-urls-contract] failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
