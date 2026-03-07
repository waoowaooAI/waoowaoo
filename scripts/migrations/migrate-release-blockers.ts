import { prisma } from '@/lib/prisma'
import { composeModelKey, parseModelKeyStrict, type CapabilitySelections } from '@/lib/model-config-contract'

type Mode = 'dry-run' | 'apply'

type UserPreferenceRow = {
  id: string
  userId: string
  customProviders: string | null
  customModels: string | null
  analysisModel: string | null
  characterModel: string | null
  locationModel: string | null
  storyboardModel: string | null
  editModel: string | null
  videoModel: string | null
  audioModel: string | null
  lipSyncModel: string | null
  capabilityDefaults: string | null
}

type NovelProjectRow = {
  id: string
  projectId: string
  analysisModel: string | null
  characterModel: string | null
  locationModel: string | null
  storyboardModel: string | null
  editModel: string | null
  videoModel: string | null
  capabilityOverrides: string | null
}

type StoredProvider = {
  id: string
  name: string
  baseUrl?: string
  apiKey?: string
  apiMode?: 'gemini-sdk' | 'openai-official'
  gatewayRoute?: 'official' | 'openai-compat'
}

type StoredModel = {
  modelId: string
  modelKey: string
  provider: string
  [key: string]: unknown
}

type ParseResult<T> = {
  ok: boolean
  value: T
}

type MigrationSummary = {
  mode: Mode
  userPreference: {
    scanned: number
    updated: number
    dirtyClearedProviders: number
    dirtyClearedModels: number
    dirtyClearedCapabilityDefaults: number
    migratedProviders: number
    migratedModels: number
    migratedDefaultModelFields: number
    migratedCapabilityDefaultKeys: number
    modelCollisionsResolvedByBailian: number
    providerCollisionsResolvedByBailian: number
    invalidModelFieldsCleared: number
  }
  novelPromotionProject: {
    scanned: number
    updated: number
    migratedModelFields: number
    migratedCapabilityOverrideKeys: number
    invalidModelFieldsCleared: number
    dirtyClearedCapabilityOverrides: number
  }
  graphArtifacts: {
    hasRequiredUniqueIndexBefore: boolean
    duplicateGroupsBefore: number
    duplicateGroupSamples: Array<{
      runId: string
      stepKey: string
      artifactType: string
      refId: string
      count: number
    }>
    deletedRowsForDedup: number
    duplicateGroupsAfter: number
    indexAdded: boolean
    hasRequiredUniqueIndexAfter: boolean
  }
}

type MysqlIndexRow = {
  Key_name: string
  Non_unique: number | string
  Seq_in_index: number | string
  Column_name: string
}

type DuplicateGroupRow = {
  runId: string
  stepKey: string
  artifactType: string
  refId: string
  c: bigint | number
}

type CountRow = {
  c: bigint | number
}

type DefaultModelField =
  | 'analysisModel'
  | 'characterModel'
  | 'locationModel'
  | 'storyboardModel'
  | 'editModel'
  | 'videoModel'
  | 'audioModel'
  | 'lipSyncModel'

type ProjectModelField =
  | 'analysisModel'
  | 'characterModel'
  | 'locationModel'
  | 'storyboardModel'
  | 'editModel'
  | 'videoModel'

type UserPreferenceUpdateData = Partial<Record<DefaultModelField, string | null>> & {
  customProviders?: string | null
  customModels?: string | null
  capabilityDefaults?: string | null
}

type NovelProjectUpdateData = Partial<Record<ProjectModelField, string | null>> & {
  capabilityOverrides?: string | null
}

const MODE: Mode = process.argv.includes('--dry-run') ? 'dry-run' : 'apply'
const APPLY = MODE === 'apply'

const OFFICIAL_ONLY_PROVIDER_KEYS = new Set(['bailian', 'siliconflow'])
const DEFAULT_MODEL_FIELDS: readonly DefaultModelField[] = [
  'analysisModel',
  'characterModel',
  'locationModel',
  'storyboardModel',
  'editModel',
  'videoModel',
  'audioModel',
  'lipSyncModel',
]
const PROJECT_MODEL_FIELDS: readonly ProjectModelField[] = [
  'analysisModel',
  'characterModel',
  'locationModel',
  'storyboardModel',
  'editModel',
  'videoModel',
]
const REQUIRED_GRAPH_ARTIFACT_UNIQUE_COLUMNS = ['runId', 'stepKey', 'artifactType', 'refId'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toNullableModelField(raw: string | null | undefined): string | null {
  const trimmed = readTrimmedString(raw)
  return trimmed || null
}

function getProviderKey(providerId: string): string {
  const index = providerId.indexOf(':')
  return index === -1 ? providerId : providerId.slice(0, index)
}

function migrateProviderId(providerId: string): string {
  const trimmed = providerId.trim()
  if (!trimmed) return trimmed
  if (trimmed === 'qwen') return 'bailian'

  const providerKey = getProviderKey(trimmed)
  if (providerKey !== 'qwen') return trimmed
  return `bailian${trimmed.slice(providerKey.length)}`
}

function migrateModelKey(rawModelKey: string): string {
  const parsed = parseModelKeyStrict(rawModelKey)
  if (!parsed) return rawModelKey
  if (getProviderKey(parsed.provider) !== 'qwen') return parsed.modelKey
  const nextProvider = migrateProviderId(parsed.provider)
  return composeModelKey(nextProvider, parsed.modelId)
}

function providerPriorityByOriginalKey(originalProviderId: string): number {
  const key = getProviderKey(originalProviderId)
  if (key === 'bailian') return 2
  if (key === 'qwen') return 1
  return 0
}

function normalizeGatewayRoute(
  providerId: string,
  rawGatewayRoute: unknown,
): 'official' | 'openai-compat' {
  const providerKey = getProviderKey(providerId)
  if (providerKey === 'openai-compatible') return 'openai-compat'
  if (providerKey === 'gemini-compatible') return 'official'
  if (OFFICIAL_ONLY_PROVIDER_KEYS.has(providerKey)) return 'official'
  return rawGatewayRoute === 'openai-compat' ? 'openai-compat' : 'official'
}

function parseJsonArray(raw: string | null): ParseResult<unknown[]> {
  if (!raw) return { ok: true, value: [] }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return { ok: false, value: [] }
    return { ok: true, value: parsed }
  } catch {
    return { ok: false, value: [] }
  }
}

function parseJsonRecord(raw: string | null): ParseResult<Record<string, unknown>> {
  if (!raw) return { ok: true, value: {} }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed)) return { ok: false, value: {} }
    return { ok: true, value: parsed }
  } catch {
    return { ok: false, value: {} }
  }
}

function migrateProviders(
  rawProviders: string | null,
): {
  ok: boolean
  nextRaw: string | null
  changed: boolean
  migratedProviders: number
  collisionsResolvedByBailian: number
} {
  const parsed = parseJsonArray(rawProviders)
  if (!parsed.ok) {
    return {
      ok: false,
      nextRaw: null,
      changed: rawProviders !== null,
      migratedProviders: 0,
      collisionsResolvedByBailian: 0,
    }
  }

  const deduped = new Map<string, { provider: StoredProvider; priority: number }>()
  let migratedProviders = 0
  let collisionsResolvedByBailian = 0

  for (const item of parsed.value) {
    if (!isRecord(item)) {
      return {
        ok: false,
        nextRaw: null,
        changed: true,
        migratedProviders: 0,
        collisionsResolvedByBailian: 0,
      }
    }

    const id = readTrimmedString(item.id)
    const name = readTrimmedString(item.name)
    if (!id || !name) {
      return {
        ok: false,
        nextRaw: null,
        changed: true,
        migratedProviders: 0,
        collisionsResolvedByBailian: 0,
      }
    }

    const nextId = migrateProviderId(id)
    if (nextId !== id) migratedProviders += 1

    const apiModeRaw = readTrimmedString(item.apiMode)
    let apiMode: 'gemini-sdk' | 'openai-official' | undefined
    if (apiModeRaw === 'gemini-sdk' || apiModeRaw === 'openai-official') {
      apiMode = apiModeRaw
    }
    if (getProviderKey(nextId) === 'gemini-compatible' && apiMode === 'openai-official') {
      apiMode = 'gemini-sdk'
    }

    const nextProvider: StoredProvider = {
      id: nextId,
      name: getProviderKey(nextId) === 'bailian' ? 'Alibaba Bailian' : name,
      baseUrl: readTrimmedString(item.baseUrl) || undefined,
      apiKey: typeof item.apiKey === 'string' ? item.apiKey.trim() : undefined,
      apiMode,
      gatewayRoute: normalizeGatewayRoute(nextId, item.gatewayRoute),
    }

    const dedupeKey = nextProvider.id.toLowerCase()
    const nextPriority = providerPriorityByOriginalKey(id)
    const existing = deduped.get(dedupeKey)
    if (!existing) {
      deduped.set(dedupeKey, { provider: nextProvider, priority: nextPriority })
      continue
    }

    if (nextPriority > existing.priority) {
      deduped.set(dedupeKey, { provider: nextProvider, priority: nextPriority })
      collisionsResolvedByBailian += 1
    }
  }

  const nextProviders = Array.from(deduped.values()).map((entry) => entry.provider)
  const nextRaw = nextProviders.length > 0 ? JSON.stringify(nextProviders) : null
  return {
    ok: true,
    nextRaw,
    changed: (rawProviders || null) !== (nextRaw || null),
    migratedProviders,
    collisionsResolvedByBailian,
  }
}

function migrateModels(
  rawModels: string | null,
): {
  ok: boolean
  nextRaw: string | null
  changed: boolean
  migratedModels: number
  collisionsResolvedByBailian: number
} {
  const parsed = parseJsonArray(rawModels)
  if (!parsed.ok) {
    return {
      ok: false,
      nextRaw: null,
      changed: rawModels !== null,
      migratedModels: 0,
      collisionsResolvedByBailian: 0,
    }
  }

  const deduped = new Map<string, { model: StoredModel; priority: number }>()
  let migratedModels = 0
  let collisionsResolvedByBailian = 0

  for (const item of parsed.value) {
    if (!isRecord(item)) {
      return {
        ok: false,
        nextRaw: null,
        changed: true,
        migratedModels: 0,
        collisionsResolvedByBailian: 0,
      }
    }

    const providerRaw = readTrimmedString(item.provider)
    const modelIdRaw = readTrimmedString(item.modelId)
    const modelKeyRaw = readTrimmedString(item.modelKey)
    const parsedModelKey = parseModelKeyStrict(modelKeyRaw)

    const sourceProvider = providerRaw || parsedModelKey?.provider || ''
    const sourceModelId = modelIdRaw || parsedModelKey?.modelId || ''
    if (!sourceProvider || !sourceModelId) {
      return {
        ok: false,
        nextRaw: null,
        changed: true,
        migratedModels: 0,
        collisionsResolvedByBailian: 0,
      }
    }

    const nextProvider = migrateProviderId(sourceProvider)
    const nextModelKey = composeModelKey(nextProvider, sourceModelId)
    if (!nextModelKey) {
      return {
        ok: false,
        nextRaw: null,
        changed: true,
        migratedModels: 0,
        collisionsResolvedByBailian: 0,
      }
    }

    if (nextProvider !== sourceProvider || nextModelKey !== modelKeyRaw) migratedModels += 1

    const nextModel: StoredModel = {
      ...item,
      provider: nextProvider,
      modelId: sourceModelId,
      modelKey: nextModelKey,
    }
    const dedupeKey = nextModelKey.toLowerCase()
    const nextPriority = providerPriorityByOriginalKey(sourceProvider)
    const existing = deduped.get(dedupeKey)
    if (!existing) {
      deduped.set(dedupeKey, { model: nextModel, priority: nextPriority })
      continue
    }

    if (nextPriority > existing.priority) {
      deduped.set(dedupeKey, { model: nextModel, priority: nextPriority })
      collisionsResolvedByBailian += 1
    }
  }

  const nextModels = Array.from(deduped.values()).map((entry) => entry.model)
  const nextRaw = nextModels.length > 0 ? JSON.stringify(nextModels) : null
  return {
    ok: true,
    nextRaw,
    changed: (rawModels || null) !== (nextRaw || null),
    migratedModels,
    collisionsResolvedByBailian,
  }
}

function migrateModelField(
  raw: string | null,
): {
  nextValue: string | null
  changed: boolean
  migrated: boolean
  clearedInvalid: boolean
} {
  const current = toNullableModelField(raw)
  if (!current) {
    return {
      nextValue: null,
      changed: current !== raw,
      migrated: false,
      clearedInvalid: false,
    }
  }

  const parsed = parseModelKeyStrict(current)
  if (!parsed) {
    return {
      nextValue: null,
      changed: true,
      migrated: false,
      clearedInvalid: true,
    }
  }

  const nextProvider = migrateProviderId(parsed.provider)
  const nextKey = composeModelKey(nextProvider, parsed.modelId)
  return {
    nextValue: nextKey || null,
    changed: (nextKey || null) !== (raw || null),
    migrated: parsed.provider !== nextProvider,
    clearedInvalid: false,
  }
}

function migrateCapabilitySelections(
  raw: string | null,
): {
  ok: boolean
  nextRaw: string | null
  changed: boolean
  migratedKeys: number
} {
  const parsed = parseJsonRecord(raw)
  if (!parsed.ok) {
    return {
      ok: false,
      nextRaw: null,
      changed: raw !== null,
      migratedKeys: 0,
    }
  }

  const deduped: CapabilitySelections = {}
  const priorities = new Map<string, number>()
  let migratedKeys = 0

  for (const [modelKey, rawSelection] of Object.entries(parsed.value)) {
    if (!isRecord(rawSelection)) {
      return {
        ok: false,
        nextRaw: null,
        changed: raw !== null,
        migratedKeys: 0,
      }
    }

    const parsedKey = parseModelKeyStrict(modelKey)
    if (!parsedKey) {
      return {
        ok: false,
        nextRaw: null,
        changed: raw !== null,
        migratedKeys: 0,
      }
    }

    const nextKey = migrateModelKey(parsedKey.modelKey)
    if (nextKey !== parsedKey.modelKey) migratedKeys += 1

    const nextSelection: Record<string, string | number | boolean> = {}
    for (const [field, value] of Object.entries(rawSelection)) {
      if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
        return {
          ok: false,
          nextRaw: null,
          changed: raw !== null,
          migratedKeys: 0,
        }
      }
      nextSelection[field] = value
    }

    const sourcePriority = providerPriorityByOriginalKey(parsedKey.provider)
    const existingPriority = priorities.get(nextKey)
    if (existingPriority === undefined || sourcePriority > existingPriority) {
      deduped[nextKey] = nextSelection
      priorities.set(nextKey, sourcePriority)
    }
  }

  const nextRaw = Object.keys(deduped).length > 0 ? JSON.stringify(deduped) : null
  return {
    ok: true,
    nextRaw,
    changed: (raw || null) !== (nextRaw || null),
    migratedKeys,
  }
}

function toIndexNumber(value: number | string): number {
  if (typeof value === 'number') return value
  return Number.parseInt(value, 10)
}

function hasRequiredGraphArtifactUniqueIndex(rows: MysqlIndexRow[]): boolean {
  const indexColumns = new Map<string, Array<{ seq: number; column: string; nonUnique: number }>>()
  for (const row of rows) {
    const seq = toIndexNumber(row.Seq_in_index)
    const nonUnique = toIndexNumber(row.Non_unique)
    if (!Number.isFinite(seq) || !Number.isFinite(nonUnique)) continue
    const key = row.Key_name
    const list = indexColumns.get(key) || []
    list.push({
      seq,
      column: row.Column_name,
      nonUnique,
    })
    indexColumns.set(key, list)
  }

  for (const entries of indexColumns.values()) {
    if (entries.length !== REQUIRED_GRAPH_ARTIFACT_UNIQUE_COLUMNS.length) continue
    const sorted = entries.sort((a, b) => a.seq - b.seq)
    if (sorted[0]?.nonUnique !== 0) continue
    const columns = sorted.map((entry) => entry.column)
    const match = columns.every((column, index) => column === REQUIRED_GRAPH_ARTIFACT_UNIQUE_COLUMNS[index])
    if (match) return true
  }
  return false
}

function toNumber(value: bigint | number): number {
  if (typeof value === 'bigint') return Number(value)
  return value
}

async function loadGraphArtifactIndexes(): Promise<MysqlIndexRow[]> {
  return await prisma.$queryRawUnsafe<MysqlIndexRow[]>('SHOW INDEX FROM graph_artifacts')
}

async function countGraphArtifactDuplicateGroups(): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<CountRow[]>(
    `SELECT COUNT(*) AS c
       FROM (
         SELECT 1
         FROM graph_artifacts
         WHERE stepKey IS NOT NULL
         GROUP BY runId, stepKey, artifactType, refId
         HAVING COUNT(*) > 1
       ) duplicate_groups`,
  )
  return rows.length > 0 ? toNumber(rows[0].c) : 0
}

async function sampleGraphArtifactDuplicateGroups(limit: number): Promise<DuplicateGroupRow[]> {
  return await prisma.$queryRawUnsafe<DuplicateGroupRow[]>(
    `SELECT runId, stepKey, artifactType, refId, COUNT(*) AS c
     FROM graph_artifacts
     WHERE stepKey IS NOT NULL
     GROUP BY runId, stepKey, artifactType, refId
     HAVING c > 1
     LIMIT ${limit}`,
  )
}

async function dedupeGraphArtifacts(): Promise<number> {
  return await prisma.$executeRawUnsafe(
    `DELETE ga1 FROM graph_artifacts ga1
     JOIN graph_artifacts ga2
       ON ga1.runId = ga2.runId
      AND ga1.stepKey = ga2.stepKey
      AND ga1.artifactType = ga2.artifactType
      AND ga1.refId = ga2.refId
      AND (
        ga1.createdAt < ga2.createdAt
        OR (ga1.createdAt = ga2.createdAt AND ga1.id < ga2.id)
      )
     WHERE ga1.stepKey IS NOT NULL`,
  )
}

async function addGraphArtifactUniqueIndex(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'ALTER TABLE graph_artifacts ADD UNIQUE INDEX graph_artifacts_runId_stepKey_artifactType_refId_key (runId, stepKey, artifactType, refId)',
  )
}

async function migrateUserPreferences(summary: MigrationSummary): Promise<void> {
  const rows = await prisma.userPreference.findMany({
    select: {
      id: true,
      userId: true,
      customProviders: true,
      customModels: true,
      analysisModel: true,
      characterModel: true,
      locationModel: true,
      storyboardModel: true,
      editModel: true,
      videoModel: true,
      audioModel: true,
      lipSyncModel: true,
      capabilityDefaults: true,
    },
  }) as UserPreferenceRow[]

  summary.userPreference.scanned = rows.length

  for (const row of rows) {
    const updateData: UserPreferenceUpdateData = {}
    let changed = false

    const providerResult = migrateProviders(row.customProviders)
    if (!providerResult.ok) {
      updateData.customProviders = null
      changed = changed || row.customProviders !== null
      summary.userPreference.dirtyClearedProviders += 1
    } else if (providerResult.changed) {
      updateData.customProviders = providerResult.nextRaw
      changed = true
      summary.userPreference.migratedProviders += providerResult.migratedProviders
      summary.userPreference.providerCollisionsResolvedByBailian += providerResult.collisionsResolvedByBailian
    }

    const modelResult = migrateModels(row.customModels)
    if (!modelResult.ok) {
      updateData.customModels = null
      changed = changed || row.customModels !== null
      summary.userPreference.dirtyClearedModels += 1
    } else if (modelResult.changed) {
      updateData.customModels = modelResult.nextRaw
      changed = true
      summary.userPreference.migratedModels += modelResult.migratedModels
      summary.userPreference.modelCollisionsResolvedByBailian += modelResult.collisionsResolvedByBailian
    }

    const capabilityResult = migrateCapabilitySelections(row.capabilityDefaults)
    if (!capabilityResult.ok) {
      updateData.capabilityDefaults = null
      changed = changed || row.capabilityDefaults !== null
      summary.userPreference.dirtyClearedCapabilityDefaults += 1
    } else if (capabilityResult.changed) {
      updateData.capabilityDefaults = capabilityResult.nextRaw
      changed = true
      summary.userPreference.migratedCapabilityDefaultKeys += capabilityResult.migratedKeys
    }

    for (const field of DEFAULT_MODEL_FIELDS) {
      const fieldResult = migrateModelField(row[field])
      if (!fieldResult.changed) continue
      updateData[field] = fieldResult.nextValue
      changed = true
      if (fieldResult.migrated) {
        summary.userPreference.migratedDefaultModelFields += 1
      }
      if (fieldResult.clearedInvalid) {
        summary.userPreference.invalidModelFieldsCleared += 1
      }
    }

    if (!changed) continue
    summary.userPreference.updated += 1

    if (APPLY) {
      await prisma.userPreference.update({
        where: { id: row.id },
        data: updateData,
      })
    }
  }
}

async function migrateNovelProjects(summary: MigrationSummary): Promise<void> {
  const rows = await prisma.novelPromotionProject.findMany({
    select: {
      id: true,
      projectId: true,
      analysisModel: true,
      characterModel: true,
      locationModel: true,
      storyboardModel: true,
      editModel: true,
      videoModel: true,
      capabilityOverrides: true,
    },
  }) as NovelProjectRow[]

  summary.novelPromotionProject.scanned = rows.length

  for (const row of rows) {
    const updateData: NovelProjectUpdateData = {}
    let changed = false

    for (const field of PROJECT_MODEL_FIELDS) {
      const fieldResult = migrateModelField(row[field])
      if (!fieldResult.changed) continue
      updateData[field] = fieldResult.nextValue
      changed = true
      if (fieldResult.migrated) {
        summary.novelPromotionProject.migratedModelFields += 1
      }
      if (fieldResult.clearedInvalid) {
        summary.novelPromotionProject.invalidModelFieldsCleared += 1
      }
    }

    const capabilityResult = migrateCapabilitySelections(row.capabilityOverrides)
    if (!capabilityResult.ok) {
      updateData.capabilityOverrides = null
      changed = changed || row.capabilityOverrides !== null
      summary.novelPromotionProject.dirtyClearedCapabilityOverrides += 1
    } else if (capabilityResult.changed) {
      updateData.capabilityOverrides = capabilityResult.nextRaw
      changed = true
      summary.novelPromotionProject.migratedCapabilityOverrideKeys += capabilityResult.migratedKeys
    }

    if (!changed) continue
    summary.novelPromotionProject.updated += 1

    if (APPLY) {
      await prisma.novelPromotionProject.update({
        where: { id: row.id },
        data: updateData,
      })
    }
  }
}

async function migrateGraphArtifacts(summary: MigrationSummary): Promise<void> {
  const beforeIndexes = await loadGraphArtifactIndexes()
  const hasRequiredBefore = hasRequiredGraphArtifactUniqueIndex(beforeIndexes)
  const duplicateGroupsBefore = await countGraphArtifactDuplicateGroups()
  const duplicateGroupSamples = await sampleGraphArtifactDuplicateGroups(20)

  summary.graphArtifacts.hasRequiredUniqueIndexBefore = hasRequiredBefore
  summary.graphArtifacts.duplicateGroupsBefore = duplicateGroupsBefore
  summary.graphArtifacts.duplicateGroupSamples = duplicateGroupSamples.map((row) => ({
    runId: row.runId,
    stepKey: row.stepKey,
    artifactType: row.artifactType,
    refId: row.refId,
    count: toNumber(row.c),
  }))

  if (APPLY && duplicateGroupsBefore > 0) {
    const deleted = await dedupeGraphArtifacts()
    summary.graphArtifacts.deletedRowsForDedup = deleted
  }

  const duplicateGroupsAfter = APPLY ? await countGraphArtifactDuplicateGroups() : duplicateGroupsBefore
  summary.graphArtifacts.duplicateGroupsAfter = duplicateGroupsAfter

  if (APPLY && !hasRequiredBefore) {
    if (duplicateGroupsAfter > 0) {
      throw new Error(
        `GRAPH_ARTIFACT_DEDUPE_INCOMPLETE: still has ${duplicateGroupsAfter} duplicate groups, unique index not added`,
      )
    }
    await addGraphArtifactUniqueIndex()
    summary.graphArtifacts.indexAdded = true
  }

  const afterIndexes = await loadGraphArtifactIndexes()
  summary.graphArtifacts.hasRequiredUniqueIndexAfter = hasRequiredGraphArtifactUniqueIndex(afterIndexes)
  if (APPLY && !summary.graphArtifacts.hasRequiredUniqueIndexAfter) {
    throw new Error('GRAPH_ARTIFACT_UNIQUE_INDEX_MISSING_AFTER_MIGRATION')
  }
}

async function main() {
  const summary: MigrationSummary = {
    mode: MODE,
    userPreference: {
      scanned: 0,
      updated: 0,
      dirtyClearedProviders: 0,
      dirtyClearedModels: 0,
      dirtyClearedCapabilityDefaults: 0,
      migratedProviders: 0,
      migratedModels: 0,
      migratedDefaultModelFields: 0,
      migratedCapabilityDefaultKeys: 0,
      modelCollisionsResolvedByBailian: 0,
      providerCollisionsResolvedByBailian: 0,
      invalidModelFieldsCleared: 0,
    },
    novelPromotionProject: {
      scanned: 0,
      updated: 0,
      migratedModelFields: 0,
      migratedCapabilityOverrideKeys: 0,
      invalidModelFieldsCleared: 0,
      dirtyClearedCapabilityOverrides: 0,
    },
    graphArtifacts: {
      hasRequiredUniqueIndexBefore: false,
      duplicateGroupsBefore: 0,
      duplicateGroupSamples: [],
      deletedRowsForDedup: 0,
      duplicateGroupsAfter: 0,
      indexAdded: false,
      hasRequiredUniqueIndexAfter: false,
    },
  }

  await migrateUserPreferences(summary)
  await migrateNovelProjects(summary)
  await migrateGraphArtifacts(summary)

  console.log(JSON.stringify(summary, null, 2))
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error: unknown) => {
    console.error('[migrate-release-blockers] failed', error)
    await prisma.$disconnect()
    process.exit(1)
  })
