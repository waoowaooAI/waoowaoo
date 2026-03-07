import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
import { prisma } from '@/lib/prisma'
import { decodeImageUrlsFromDb } from '@/lib/contracts/image-urls-contract'

type AppearanceRow = {
  id: string
  imageUrls: string | null
  previousImageUrls: string | null
}

type DynamicModel = {
  findMany: (args: unknown) => Promise<AppearanceRow[]>
}

const BATCH_SIZE = 500

const MODELS: Array<{ name: string; model: string }> = [
  { name: 'CharacterAppearance', model: 'characterAppearance' },
  { name: 'GlobalCharacterAppearance', model: 'globalCharacterAppearance' },
]

const prismaDynamic = prisma as unknown as Record<string, DynamicModel>

function print(message: string) {
  process.stdout.write(`${message}\n`)
}

async function checkModel(modelName: string, modelKey: string) {
  const model = prismaDynamic[modelKey]
  if (!model) {
    throw new Error(`Prisma model not found: ${modelKey}`)
  }

  let scanned = 0
  let violations = 0
  const samples: Array<{ id: string; field: 'imageUrls' | 'previousImageUrls'; message: string; value: string | null }> = []
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
      scanned += 1

      for (const fieldName of ['imageUrls', 'previousImageUrls'] as const) {
        try {
          decodeImageUrlsFromDb(row[fieldName], `${modelName}.${fieldName}`)
        } catch (error) {
          violations += 1
          if (samples.length < 20) {
            samples.push({
              id: row.id,
              field: fieldName,
              message: error instanceof Error ? error.message : String(error),
              value: row[fieldName],
            })
          }
        }
      }
    }

    cursor = rows[rows.length - 1]?.id || null
  }

  const summary = `[check-image-urls-contract] ${modelName}: scanned=${scanned} violations=${violations}`
  _ulogInfo(summary)
  print(summary)
  if (samples.length > 0) {
    _ulogError(`[check-image-urls-contract] ${modelName}: samples=${JSON.stringify(samples, null, 2)}`)
  }

  return { scanned, violations }
}

async function main() {
  let totalScanned = 0
  let totalViolations = 0

  for (const target of MODELS) {
    const result = await checkModel(target.name, target.model)
    totalScanned += result.scanned
    totalViolations += result.violations
  }

  if (totalViolations > 0) {
    _ulogError(`[check-image-urls-contract] failed scanned=${totalScanned} violations=${totalViolations}`)
    print(`[check-image-urls-contract] failed scanned=${totalScanned} violations=${totalViolations}`)
    process.exitCode = 1
    return
  }

  print(`[check-image-urls-contract] ok scanned=${totalScanned}`)
}

main()
  .catch((error) => {
    _ulogError('[check-image-urls-contract] failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
