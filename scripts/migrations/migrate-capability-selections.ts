import { prisma } from '@/lib/prisma'
import {
  parseModelKeyStrict,
  type CapabilitySelections,
  type CapabilityValue,
} from '@/lib/model-config-contract'
import { findBuiltinCapabilities } from '@/lib/model-capabilities/catalog'

const APPLY = process.argv.includes('--apply')

const USER_IMAGE_MODEL_FIELDS = [
  'characterModel',
  'locationModel',
  'storyboardModel',
  'editModel',
] as const

const PROJECT_IMAGE_MODEL_FIELDS = [
  'characterModel',
  'locationModel',
  'storyboardModel',
  'editModel',
] as const

type UserImageModelField = typeof USER_IMAGE_MODEL_FIELDS[number]
type ProjectImageModelField = typeof PROJECT_IMAGE_MODEL_FIELDS[number]

interface UserPreferenceRow {
  id: string
  userId: string
  imageResolution: string
  capabilityDefaults: string | null
  characterModel: string | null
  locationModel: string | null
  storyboardModel: string | null
  editModel: string | null
}

interface ProjectRow {
  id: string
  projectId: string
  imageResolution: string
  videoResolution: string
  capabilityOverrides: string | null
  characterModel: string | null
  locationModel: string | null
  storyboardModel: string | null
  editModel: string | null
  videoModel: string | null
}

interface MigrationSummary {
  mode: 'dry-run' | 'apply'
  userPreference: {
    scanned: number
    updated: number
    migratedImageResolution: number
  }
  novelPromotionProject: {
    scanned: number
    updated: number
    migratedImageResolution: number
    migratedVideoResolution: number
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isCapabilityValue(value: unknown): value is CapabilityValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function normalizeSelections(raw: unknown): CapabilitySelections {
  if (!isRecord(raw)) return {}

  const normalized: CapabilitySelections = {}
  for (const [modelKey, rawSelection] of Object.entries(raw)) {
    if (!isRecord(rawSelection)) continue

    const nextSelection: Record<string, CapabilityValue> = {}
    for (const [field, value] of Object.entries(rawSelection)) {
      if (isCapabilityValue(value)) {
        nextSelection[field] = value
      }
    }

    normalized[modelKey] = nextSelection
  }

  return normalized
}

function parseSelections(raw: string | null): CapabilitySelections {
  if (!raw) return {}
  try {
    return normalizeSelections(JSON.parse(raw) as unknown)
  } catch {
    return {}
  }
}

function serializeSelections(selections: CapabilitySelections): string | null {
  if (Object.keys(selections).length === 0) return null
  return JSON.stringify(selections)
}

function getCapabilityResolutionOptions(
  modelType: 'image' | 'video',
  modelKey: string,
): string[] {
  const parsed = parseModelKeyStrict(modelKey)
  if (!parsed) return []

  const capabilities = findBuiltinCapabilities(modelType, parsed.provider, parsed.modelId)
  const namespace = capabilities?.[modelType]
  if (!namespace || !isRecord(namespace)) return []

  const resolutionOptions = namespace.resolutionOptions
  if (!Array.isArray(resolutionOptions)) return []

  return resolutionOptions.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function ensureModelResolutionSelection(input: {
  modelType: 'image' | 'video'
  modelKey: string
  resolution: string
  selections: CapabilitySelections
}): boolean {
  const options = getCapabilityResolutionOptions(input.modelType, input.modelKey)
  if (options.length === 0) return false
  if (!options.includes(input.resolution)) return false

  const current = input.selections[input.modelKey]
  if (current && current.resolution !== undefined) {
    return false
  }

  input.selections[input.modelKey] = {
    ...(current || {}),
    resolution: input.resolution,
  }
  return true
}

function collectModelKeys<RowType>(
  row: RowType,
  fields: readonly (keyof RowType)[],
): string[] {
  const modelKeys: string[] = []
  for (const field of fields) {
    const value = row[field]
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed) continue
    modelKeys.push(trimmed)
  }
  return modelKeys
}

async function migrateUserPreferences(summary: MigrationSummary) {
  const rows = await prisma.userPreference.findMany({
    select: {
      id: true,
      userId: true,
      imageResolution: true,
      capabilityDefaults: true,
      characterModel: true,
      locationModel: true,
      storyboardModel: true,
      editModel: true,
    },
  }) as UserPreferenceRow[]

  summary.userPreference.scanned = rows.length

  for (const row of rows) {
    const nextSelections = parseSelections(row.capabilityDefaults)
    const modelKeys = collectModelKeys<UserPreferenceRow>(row, USER_IMAGE_MODEL_FIELDS)
    let changed = false

    for (const modelKey of modelKeys) {
      if (ensureModelResolutionSelection({
        modelType: 'image',
        modelKey,
        resolution: row.imageResolution,
        selections: nextSelections,
      })) {
        changed = true
        summary.userPreference.migratedImageResolution += 1
      }
    }

    if (!changed) continue
    summary.userPreference.updated += 1

    if (APPLY) {
      await prisma.userPreference.update({
        where: { id: row.id },
        data: {
          capabilityDefaults: serializeSelections(nextSelections),
        },
      })
    }
  }
}

async function migrateProjects(summary: MigrationSummary) {
  const rows = await prisma.novelPromotionProject.findMany({
    select: {
      id: true,
      projectId: true,
      imageResolution: true,
      videoResolution: true,
      capabilityOverrides: true,
      characterModel: true,
      locationModel: true,
      storyboardModel: true,
      editModel: true,
      videoModel: true,
    },
  }) as ProjectRow[]

  summary.novelPromotionProject.scanned = rows.length

  for (const row of rows) {
    const nextSelections = parseSelections(row.capabilityOverrides)
    const imageModelKeys = collectModelKeys<ProjectRow>(row, PROJECT_IMAGE_MODEL_FIELDS)
    let changed = false

    for (const modelKey of imageModelKeys) {
      if (ensureModelResolutionSelection({
        modelType: 'image',
        modelKey,
        resolution: row.imageResolution,
        selections: nextSelections,
      })) {
        changed = true
        summary.novelPromotionProject.migratedImageResolution += 1
      }
    }

    if (typeof row.videoModel === 'string' && row.videoModel.trim()) {
      if (ensureModelResolutionSelection({
        modelType: 'video',
        modelKey: row.videoModel.trim(),
        resolution: row.videoResolution,
        selections: nextSelections,
      })) {
        changed = true
        summary.novelPromotionProject.migratedVideoResolution += 1
      }
    }

    if (!changed) continue
    summary.novelPromotionProject.updated += 1

    if (APPLY) {
      await prisma.novelPromotionProject.update({
        where: { id: row.id },
        data: {
          capabilityOverrides: serializeSelections(nextSelections),
        },
      })
    }
  }
}

async function main() {
  const summary: MigrationSummary = {
    mode: APPLY ? 'apply' : 'dry-run',
    userPreference: {
      scanned: 0,
      updated: 0,
      migratedImageResolution: 0,
    },
    novelPromotionProject: {
      scanned: 0,
      updated: 0,
      migratedImageResolution: 0,
      migratedVideoResolution: 0,
    },
  }

  await migrateUserPreferences(summary)
  await migrateProjects(summary)

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    const missingColumn =
      message.includes('capabilityDefaults') || message.includes('capabilityOverrides')
    if (missingColumn && message.includes('does not exist')) {
      process.stderr.write(
        '[migrate-capability-selections] FAILED: required DB columns are missing. ' +
        'Apply SQL migration `prisma/migrations/20260215_add_capability_selection_columns.sql` first.\n',
      )
    } else {
      process.stderr.write(`[migrate-capability-selections] FAILED: ${message}\n`)
    }
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
