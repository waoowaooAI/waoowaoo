import { prisma } from '@/lib/prisma'
import { migrateGatewayRoutePayload } from '@/lib/migrations/gateway-route-openai-compat'

const APPLY = process.argv.includes('--apply')

type PreferenceRow = {
  id: string
  userId: string
  customProviders: string | null
}

type MigrationSummary = {
  mode: 'dry-run' | 'apply'
  scanned: number
  updatedRows: number
  migratedProviders: number
  routeLitellmToOpenaiCompat: number
  routeForcedOfficial: number
  geminiApiModeCorrected: number
  skippedInvalidRows: number
}

async function main() {
  const summary: MigrationSummary = {
    mode: APPLY ? 'apply' : 'dry-run',
    scanned: 0,
    updatedRows: 0,
    migratedProviders: 0,
    routeLitellmToOpenaiCompat: 0,
    routeForcedOfficial: 0,
    geminiApiModeCorrected: 0,
    skippedInvalidRows: 0,
  }

  const rows = await prisma.userPreference.findMany({
    select: {
      id: true,
      userId: true,
      customProviders: true,
    },
  }) as PreferenceRow[]
  summary.scanned = rows.length

  for (const row of rows) {
    const result = migrateGatewayRoutePayload(row.customProviders)
    if (result.status === 'invalid') {
      summary.skippedInvalidRows += 1
      continue
    }

    summary.migratedProviders += result.summary.providersChanged
    summary.routeLitellmToOpenaiCompat += result.summary.routeLitellmToOpenaiCompat
    summary.routeForcedOfficial += result.summary.routeForcedOfficial
    summary.geminiApiModeCorrected += result.summary.geminiApiModeCorrected

    if (!result.changed) continue
    summary.updatedRows += 1

    if (APPLY) {
      await prisma.userPreference.update({
        where: { id: row.id },
        data: {
          customProviders: result.nextRaw ?? null,
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
    console.error('[migrate-gateway-route-openai-compat] failed', error)
    await prisma.$disconnect()
    process.exit(1)
  })
