import { prisma } from '@/lib/prisma'

const APPLY = process.argv.includes('--apply')

type PreferenceRow = {
  id: string
  userId: string
  customModels: string | null
}

type MigrationSummary = {
  mode: 'dry-run' | 'apply'
  scanned: number
  updatedRows: number
  migratedModels: number
  skippedInvalidRows: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function parseCustomModels(raw: string | null): unknown[] | null {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

function migrateLegacyCustomPricing(raw: unknown): {
  changed: boolean
  next: unknown
} {
  if (!isRecord(raw)) {
    return { changed: false, next: raw }
  }

  const hasLegacyInput = typeof raw.input === 'number' && Number.isFinite(raw.input) && raw.input >= 0
  const hasLegacyOutput = typeof raw.output === 'number' && Number.isFinite(raw.output) && raw.output >= 0
  if (!hasLegacyInput && !hasLegacyOutput) {
    return { changed: false, next: raw }
  }

  const llmRaw = isRecord(raw.llm) ? raw.llm : {}
  const llmInput = typeof llmRaw.inputPerMillion === 'number' && Number.isFinite(llmRaw.inputPerMillion) && llmRaw.inputPerMillion >= 0
    ? llmRaw.inputPerMillion
    : (hasLegacyInput ? raw.input as number : undefined)
  const llmOutput = typeof llmRaw.outputPerMillion === 'number' && Number.isFinite(llmRaw.outputPerMillion) && llmRaw.outputPerMillion >= 0
    ? llmRaw.outputPerMillion
    : (hasLegacyOutput ? raw.output as number : undefined)

  const nextPricing: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'input' || key === 'output') continue
    nextPricing[key] = value
  }

  nextPricing.llm = {
    ...(llmInput !== undefined ? { inputPerMillion: llmInput } : {}),
    ...(llmOutput !== undefined ? { outputPerMillion: llmOutput } : {}),
  }

  return {
    changed: true,
    next: nextPricing,
  }
}

function migrateCustomModel(rawModel: unknown): { changed: boolean; next: unknown } {
  if (!isRecord(rawModel)) {
    return { changed: false, next: rawModel }
  }

  const migratedPricing = migrateLegacyCustomPricing(rawModel.customPricing)
  if (!migratedPricing.changed) {
    return { changed: false, next: rawModel }
  }

  return {
    changed: true,
    next: {
      ...rawModel,
      customPricing: migratedPricing.next,
    },
  }
}

async function main() {
  const summary: MigrationSummary = {
    mode: APPLY ? 'apply' : 'dry-run',
    scanned: 0,
    updatedRows: 0,
    migratedModels: 0,
    skippedInvalidRows: 0,
  }

  const rows = await prisma.userPreference.findMany({
    select: {
      id: true,
      userId: true,
      customModels: true,
    },
  }) as PreferenceRow[]

  summary.scanned = rows.length

  for (const row of rows) {
    const parsedModels = parseCustomModels(row.customModels)
    if (parsedModels === null) {
      summary.skippedInvalidRows += 1
      continue
    }

    let rowChanged = false
    const nextModels = parsedModels.map((model) => {
      const migrated = migrateCustomModel(model)
      if (migrated.changed) {
        rowChanged = true
        summary.migratedModels += 1
      }
      return migrated.next
    })

    if (!rowChanged) continue
    summary.updatedRows += 1

    if (APPLY) {
      await prisma.userPreference.update({
        where: { id: row.id },
        data: {
          customModels: JSON.stringify(nextModels),
        },
      })
    }
  }

  console.log(JSON.stringify(summary, null, 2))
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error: unknown) => {
    console.error('[migrate-custom-pricing-v2] failed', error)
    await prisma.$disconnect()
    process.exit(1)
  })
