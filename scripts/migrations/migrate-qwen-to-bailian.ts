import { prisma } from '@/lib/prisma'
import { composeModelKey, parseModelKeyStrict, type CapabilitySelections } from '@/lib/model-config-contract'

const APPLY = process.argv.includes('--apply')

type PreferenceRow = {
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
  lipSyncModel: string | null
  capabilityDefaults: string | null
}

type StoredProvider = {
  id: string
  name: string
  baseUrl?: string
  apiKey?: string
  apiMode?: 'gemini-sdk' | 'openai-official'
  gatewayRoute?: 'official' | 'litellm'
}

type StoredModel = {
  modelId: string
  modelKey: string
  name: string
  type: string
  provider: string
  price: number
}

type MigrationConflict = {
  userId: string
  reason: string
}

type MigrationSummary = {
  mode: 'dry-run' | 'apply'
  scanned: number
  updatedRows: number
  updatedProviders: number
  updatedModels: number
  updatedDefaults: number
  updatedCapabilityDefaults: number
  invalidRows: number
  conflicts: MigrationConflict[]
}

type DefaultModelField =
  | 'analysisModel'
  | 'characterModel'
  | 'locationModel'
  | 'storyboardModel'
  | 'editModel'
  | 'videoModel'
  | 'lipSyncModel'

const DEFAULT_MODEL_FIELDS: readonly DefaultModelField[] = [
  'analysisModel',
  'characterModel',
  'locationModel',
  'storyboardModel',
  'editModel',
  'videoModel',
  'lipSyncModel',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseProviders(raw: string | null): StoredProvider[] | null {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    const providers: StoredProvider[] = []
    for (const item of parsed) {
      if (!isRecord(item)) return null
      const id = readTrimmedString(item.id)
      const name = readTrimmedString(item.name)
      if (!id || !name) return null
      const provider: StoredProvider = { id, name }
      if (typeof item.baseUrl === 'string' && item.baseUrl.trim()) provider.baseUrl = item.baseUrl.trim()
      if (typeof item.apiKey === 'string' && item.apiKey.trim()) provider.apiKey = item.apiKey.trim()
      if (item.apiMode === 'gemini-sdk' || item.apiMode === 'openai-official') provider.apiMode = item.apiMode
      if (item.gatewayRoute === 'official' || item.gatewayRoute === 'litellm') provider.gatewayRoute = item.gatewayRoute
      providers.push(provider)
    }
    return providers
  } catch {
    return null
  }
}

function parseModels(raw: string | null): StoredModel[] | null {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    const models: StoredModel[] = []
    for (const item of parsed) {
      if (!isRecord(item)) return null
      const modelId = readTrimmedString(item.modelId)
      const modelKey = readTrimmedString(item.modelKey)
      const provider = readTrimmedString(item.provider)
      const name = readTrimmedString(item.name)
      const type = readTrimmedString(item.type)
      const price = typeof item.price === 'number' && Number.isFinite(item.price) ? item.price : 0
      if (!modelId || !provider || !type) return null
      const normalizedModelKey = modelKey || composeModelKey(provider, modelId)
      if (!normalizedModelKey) return null
      models.push({
        modelId,
        modelKey: normalizedModelKey,
        provider,
        name: name || modelId,
        type,
        price,
      })
    }
    return models
  } catch {
    return null
  }
}

function parseCapabilityDefaults(raw: string | null): CapabilitySelections | null {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed)) return null
    const selections: CapabilitySelections = {}
    for (const [modelKey, value] of Object.entries(parsed)) {
      if (!isRecord(value)) continue
      const nextSelection: Record<string, string | number | boolean> = {}
      for (const [field, option] of Object.entries(value)) {
        if (typeof option === 'string' || typeof option === 'number' || typeof option === 'boolean') {
          nextSelection[field] = option
        }
      }
      selections[modelKey] = nextSelection
    }
    return selections
  } catch {
    return null
  }
}

function migrateProviderId(providerId: string): string {
  if (providerId === 'qwen') return 'bailian'
  const parsed = parseModelKeyStrict(providerId)
  if (parsed) return providerId
  const marker = providerId.indexOf(':')
  if (marker === -1) return providerId
  const providerKey = providerId.slice(0, marker)
  if (providerKey !== 'qwen') return providerId
  return `bailian${providerId.slice(marker)}`
}

function migrateModelKey(rawModelKey: string): string {
  const parsed = parseModelKeyStrict(rawModelKey)
  if (!parsed) return rawModelKey
  if (parsed.provider !== 'qwen') return parsed.modelKey
  return composeModelKey('bailian', parsed.modelId)
}

function migrateDefaultModel(rawValue: string | null): string | null {
  if (!rawValue) return rawValue
  const value = rawValue.trim()
  if (!value) return null
  return migrateModelKey(value)
}

function hasProviderByKey(providers: StoredProvider[], providerKey: string): boolean {
  return providers.some((provider) => {
    const marker = provider.id.indexOf(':')
    const key = marker === -1 ? provider.id : provider.id.slice(0, marker)
    return key === providerKey
  })
}

async function main() {
  const summary: MigrationSummary = {
    mode: APPLY ? 'apply' : 'dry-run',
    scanned: 0,
    updatedRows: 0,
    updatedProviders: 0,
    updatedModels: 0,
    updatedDefaults: 0,
    updatedCapabilityDefaults: 0,
    invalidRows: 0,
    conflicts: [],
  }

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
      lipSyncModel: true,
      capabilityDefaults: true,
    },
  }) as PreferenceRow[]

  summary.scanned = rows.length

  for (const row of rows) {
    const providers = parseProviders(row.customProviders)
    const models = parseModels(row.customModels)
    const capabilityDefaults = parseCapabilityDefaults(row.capabilityDefaults)
    if (!providers || !models || !capabilityDefaults) {
      summary.invalidRows += 1
      continue
    }

    const hasQwenProvider = hasProviderByKey(providers, 'qwen')
    const hasBailianProvider = hasProviderByKey(providers, 'bailian')
    if (hasQwenProvider && hasBailianProvider) {
      summary.conflicts.push({
        userId: row.userId,
        reason: 'both qwen and bailian providers exist',
      })
      continue
    }

    let rowChanged = false

    const nextProviders = providers.map((provider) => {
      const nextId = migrateProviderId(provider.id)
      if (nextId !== provider.id) {
        rowChanged = true
        summary.updatedProviders += 1
      }
      return {
        ...provider,
        id: nextId,
        ...(nextId === 'bailian' ? { name: 'Alibaba Bailian' } : {}),
      }
    })

    const nextModels = models.map((model) => {
      const nextProvider = migrateProviderId(model.provider)
      const nextModelKey = migrateModelKey(model.modelKey)
      const changed = nextProvider !== model.provider || nextModelKey !== model.modelKey
      if (changed) {
        rowChanged = true
        summary.updatedModels += 1
      }
      return {
        ...model,
        provider: nextProvider,
        modelKey: nextModelKey,
      }
    })
    const modelKeySet = new Set<string>()
    let hasModelConflict = false
    for (const model of nextModels) {
      if (!modelKeySet.has(model.modelKey)) {
        modelKeySet.add(model.modelKey)
        continue
      }
      hasModelConflict = true
      break
    }
    if (hasModelConflict) {
      summary.conflicts.push({
        userId: row.userId,
        reason: 'model key collision after qwen -> bailian migration',
      })
      continue
    }

    const nextDefaults: Partial<Record<DefaultModelField, string | null>> = {}
    for (const field of DEFAULT_MODEL_FIELDS) {
      const current = row[field]
      const next = migrateDefaultModel(current)
      nextDefaults[field] = next
      if ((current || null) !== (next || null)) {
        rowChanged = true
        summary.updatedDefaults += 1
      }
    }

    const nextCapabilityDefaults: CapabilitySelections = {}
    for (const [modelKey, selection] of Object.entries(capabilityDefaults)) {
      const nextModelKey = migrateModelKey(modelKey)
      nextCapabilityDefaults[nextModelKey] = selection
      if (nextModelKey !== modelKey) {
        rowChanged = true
        summary.updatedCapabilityDefaults += 1
      }
    }

    if (!rowChanged) continue
    summary.updatedRows += 1

    if (APPLY) {
      await prisma.userPreference.update({
        where: { id: row.id },
        data: {
          customProviders: JSON.stringify(nextProviders),
          customModels: JSON.stringify(nextModels),
          analysisModel: nextDefaults.analysisModel || null,
          characterModel: nextDefaults.characterModel || null,
          locationModel: nextDefaults.locationModel || null,
          storyboardModel: nextDefaults.storyboardModel || null,
          editModel: nextDefaults.editModel || null,
          videoModel: nextDefaults.videoModel || null,
          lipSyncModel: nextDefaults.lipSyncModel || null,
          capabilityDefaults: Object.keys(nextCapabilityDefaults).length > 0
            ? JSON.stringify(nextCapabilityDefaults)
            : null,
        },
      })
    }
  }

  console.log(JSON.stringify(summary, null, 2))
  if (summary.conflicts.length > 0) {
    process.exitCode = 2
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error: unknown) => {
    console.error('[migrate-qwen-to-bailian] failed', error)
    await prisma.$disconnect()
    process.exit(1)
  })
