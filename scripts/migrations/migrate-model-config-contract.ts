import fs from 'fs'
import path from 'path'
import { prisma } from '@/lib/prisma'
import {
  composeModelKey,
  parseModelKeyStrict,
  validateModelCapabilities,
  type ModelCapabilities,
  type UnifiedModelType,
} from '@/lib/model-config-contract'

type ModelField =
  | 'analysisModel'
  | 'characterModel'
  | 'locationModel'
  | 'storyboardModel'
  | 'editModel'
  | 'videoModel'

type PreferenceRow = {
  id: string
  userId: string
  customModels: string | null
  analysisModel: string | null
  characterModel: string | null
  locationModel: string | null
  storyboardModel: string | null
  editModel: string | null
  videoModel: string | null
}

type ProjectRow = {
  id: string
  projectId: string
  analysisModel: string | null
  characterModel: string | null
  locationModel: string | null
  storyboardModel: string | null
  editModel: string | null
  videoModel: string | null
  project: {
    userId: string
  }
}

type MigrationIssue = {
  table: 'userPreference' | 'novelPromotionProject'
  rowId: string
  userId?: string
  field: string
  kind:
    | 'CUSTOM_MODELS_JSON_INVALID'
    | 'MODEL_SHAPE_INVALID'
    | 'MODEL_TYPE_INVALID'
    | 'MODEL_KEY_INCOMPLETE'
    | 'MODEL_KEY_MISMATCH'
    | 'MODEL_CAPABILITY_INVALID'
    | 'LEGACY_MODEL_ID_NOT_FOUND'
    | 'LEGACY_MODEL_ID_AMBIGUOUS'
  rawValue?: string | null
  candidates?: string[]
  message: string
}

type MigrationReport = {
  generatedAt: string
  mode: 'dry-run' | 'apply'
  userPreference: {
    scanned: number
    updated: number
    updatedCustomModels: number
    updatedDefaultFields: number
  }
  novelPromotionProject: {
    scanned: number
    updated: number
    updatedFields: number
  }
  issues: MigrationIssue[]
}

type NormalizedModel = {
  provider: string
  modelId: string
  modelKey: string
  name: string
  type: UnifiedModelType
  price: number
  resolution?: '2K' | '4K'
  capabilities?: ModelCapabilities
}

const APPLY = process.argv.includes('--apply')
const MAX_ISSUES = 500
const MODEL_FIELDS: readonly ModelField[] = [
  'analysisModel',
  'characterModel',
  'locationModel',
  'storyboardModel',
  'editModel',
  'videoModel',
]

const LEGACY_MODEL_ID_MAP = new Map<string, string>([
  ['anthropic/claude-sonnet-4.5', 'openrouter::anthropic/claude-sonnet-4.5'],
  ['google/gemini-3-pro-preview', 'openrouter::google/gemini-3-pro-preview'],
  ['openai/gpt-5.2', 'openrouter::openai/gpt-5.2'],
  ['banana', 'fal::banana'],
  ['banana-2k', 'fal::banana'],
  ['seedream', 'ark::doubao-seedream-4-0-250828'],
  ['seedream4.5', 'ark::doubao-seedream-4-5-251128'],
  ['gemini-3-pro-image-preview', 'google::gemini-3-pro-image-preview'],
  ['gemini-3-pro-image-preview-batch', 'google::gemini-3-pro-image-preview-batch'],
  ['nano-banana-pro', 'google::gemini-3-pro-image-preview'],
  ['gemini-3.0-pro-image-portrait', 'flow2api::gemini-3.0-pro-image-portrait'],
  ['imagen-4.0-ultra-generate-001', 'google::imagen-4.0-ultra-generate-001'],
  ['doubao-seedance-1-0-pro-250528', 'ark::doubao-seedance-1-0-pro-250528'],
  ['doubao-seedance-1-0-pro-fast-251015', 'ark::doubao-seedance-1-0-pro-fast-251015'],
  ['doubao-seedance-1-0-pro-fast-251015-batch', 'ark::doubao-seedance-1-0-pro-fast-251015-batch'],
])

function parseReportPathArg(): string {
  const flagPrefix = '--report='
  const inline = process.argv.find((arg) => arg.startsWith(flagPrefix))
  if (inline) return inline.slice(flagPrefix.length)
  const flagIndex = process.argv.findIndex((arg) => arg === '--report')
  if (flagIndex !== -1 && process.argv[flagIndex + 1]) {
    return process.argv[flagIndex + 1]
  }
  return 'scripts/migrations/reports/model-config-migration-report.json'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isUnifiedModelType(value: unknown): value is UnifiedModelType {
  return value === 'llm'
    || value === 'image'
    || value === 'video'
    || value === 'audio'
    || value === 'lipsync'
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value)
}

function parseCustomModels(raw: string | null): { ok: true; value: unknown[] } | { ok: false } {
  if (!raw) return { ok: true, value: [] }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return { ok: false }
    return { ok: true, value: parsed }
  } catch {
    return { ok: false }
  }
}

function normalizeModel(
  raw: unknown,
): { normalized: NormalizedModel | null; changed: boolean; issue?: Omit<MigrationIssue, 'table' | 'rowId'> } {
  if (!isRecord(raw)) {
    return {
      normalized: null,
      changed: false,
      issue: {
        field: 'customModels',
        kind: 'MODEL_SHAPE_INVALID',
        message: 'customModels item must be object',
      },
    }
  }

  const modelType = raw.type
  if (!isUnifiedModelType(modelType)) {
    return {
      normalized: null,
      changed: false,
      issue: {
        field: 'customModels.type',
        kind: 'MODEL_TYPE_INVALID',
        rawValue: String(raw.type ?? ''),
        message: 'custom model type must be llm/image/video/audio/lipsync',
      },
    }
  }

  const providerField = toTrimmedString(raw.provider)
  const modelIdField = toTrimmedString(raw.modelId)
  const parsedModelKey = parseModelKeyStrict(toTrimmedString(raw.modelKey))

  const provider = providerField || parsedModelKey?.provider || ''
  const modelId = modelIdField || parsedModelKey?.modelId || ''
  const modelKey = composeModelKey(provider, modelId)
  if (!modelKey) {
    return {
      normalized: null,
      changed: false,
      issue: {
        field: 'customModels.modelKey',
        kind: 'MODEL_KEY_INCOMPLETE',
        rawValue: toTrimmedString(raw.modelKey),
        message: 'provider/modelId/modelKey cannot compose a valid model_key',
      },
    }
  }

  if (parsedModelKey && parsedModelKey.modelKey !== modelKey) {
    return {
      normalized: null,
      changed: false,
      issue: {
        field: 'customModels.modelKey',
        kind: 'MODEL_KEY_MISMATCH',
        rawValue: toTrimmedString(raw.modelKey),
        message: 'modelKey conflicts with provider/modelId',
      },
    }
  }

  const rawResolution = toTrimmedString(raw.resolution)
  const resolution = rawResolution === '2K' || rawResolution === '4K' ? rawResolution : undefined
  const capabilities = isRecord(raw.capabilities)
    ? ({ ...(raw.capabilities as ModelCapabilities) })
    : undefined
  const capabilityIssues = validateModelCapabilities(modelType, capabilities)
  if (capabilityIssues.length > 0) {
    const firstIssue = capabilityIssues[0]
    return {
      normalized: null,
      changed: false,
      issue: {
        field: firstIssue.field,
        kind: 'MODEL_CAPABILITY_INVALID',
        message: `${firstIssue.code}: ${firstIssue.message}`,
      },
    }
  }

  const name = toTrimmedString(raw.name) || modelId
  const price = typeof raw.price === 'number' && Number.isFinite(raw.price) ? raw.price : 0

  const normalized: NormalizedModel = {
    provider,
    modelId,
    modelKey,
    name,
    type: modelType,
    price,
    ...(resolution ? { resolution } : {}),
    ...(capabilities ? { capabilities } : {}),
  }

  const changed = stableStringify(raw) !== stableStringify(normalized)
  return { normalized, changed }
}

function addIssue(report: MigrationReport, issue: MigrationIssue) {
  if (report.issues.length >= MAX_ISSUES) return
  report.issues.push(issue)
}

function normalizeModelFieldValue(
  rawValue: string | null,
  field: ModelField,
  mappingByModelId: Map<string, string[]>,
): { nextValue: string | null; changed: boolean; issue?: Omit<MigrationIssue, 'table' | 'rowId'> } {
  if (!rawValue || !rawValue.trim()) return { nextValue: null, changed: rawValue !== null }
  const trimmed = rawValue.trim()
  const parsed = parseModelKeyStrict(trimmed)
  if (parsed) {
    return { nextValue: parsed.modelKey, changed: parsed.modelKey !== rawValue }
  }

  const candidates = mappingByModelId.get(trimmed) || []
  if (candidates.length === 1) {
    return { nextValue: candidates[0], changed: candidates[0] !== rawValue }
  }
  if (candidates.length === 0) {
    const mappedModelKey = LEGACY_MODEL_ID_MAP.get(trimmed)
    if (mappedModelKey) {
      return { nextValue: mappedModelKey, changed: mappedModelKey !== rawValue }
    }
  }
  if (candidates.length === 0) {
    return {
      nextValue: rawValue,
      changed: false,
      issue: {
        field,
        kind: 'LEGACY_MODEL_ID_NOT_FOUND',
        rawValue,
        message: `${field} legacy modelId cannot be mapped`,
      },
    }
  }
  return {
    nextValue: rawValue,
    changed: false,
    issue: {
      field,
      kind: 'LEGACY_MODEL_ID_AMBIGUOUS',
      rawValue,
      candidates,
      message: `${field} legacy modelId maps to multiple providers`,
    },
  }
}

async function main() {
  const reportPath = parseReportPathArg()
  const report: MigrationReport = {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    userPreference: {
      scanned: 0,
      updated: 0,
      updatedCustomModels: 0,
      updatedDefaultFields: 0,
    },
    novelPromotionProject: {
      scanned: 0,
      updated: 0,
      updatedFields: 0,
    },
    issues: [],
  }

  const userPrefs = await prisma.userPreference.findMany({
    select: {
      id: true,
      userId: true,
      customModels: true,
      analysisModel: true,
      characterModel: true,
      locationModel: true,
      storyboardModel: true,
      editModel: true,
      videoModel: true,
    },
  })

  const userMappings = new Map<string, Map<string, string[]>>()

  for (const pref of userPrefs) {
    report.userPreference.scanned += 1
    const updateData: Partial<Record<ModelField | 'customModels', string | null>> = {}

    const parsedCustomModels = parseCustomModels(pref.customModels)
    const normalizedModels: NormalizedModel[] = []
    let customModelsChanged = false

    if (!parsedCustomModels.ok) {
      addIssue(report, {
        table: 'userPreference',
        rowId: pref.id,
        userId: pref.userId,
        field: 'customModels',
        kind: 'CUSTOM_MODELS_JSON_INVALID',
        rawValue: pref.customModels,
        message: 'customModels JSON is invalid',
      })
    } else {
      for (let index = 0; index < parsedCustomModels.value.length; index += 1) {
        const normalizedResult = normalizeModel(parsedCustomModels.value[index])
        if (normalizedResult.issue) {
          addIssue(report, {
            table: 'userPreference',
            rowId: pref.id,
            userId: pref.userId,
            ...normalizedResult.issue,
          })
          continue
        }
        if (normalizedResult.normalized) {
          normalizedModels.push(normalizedResult.normalized)
          if (normalizedResult.changed) customModelsChanged = true
        }
      }
    }

    const mappingByModelId = new Map<string, string[]>()
    for (const model of normalizedModels) {
      const existing = mappingByModelId.get(model.modelId) || []
      if (!existing.includes(model.modelKey)) existing.push(model.modelKey)
      mappingByModelId.set(model.modelId, existing)
    }
    userMappings.set(pref.userId, mappingByModelId)

    if (customModelsChanged) {
      updateData.customModels = JSON.stringify(normalizedModels)
      report.userPreference.updatedCustomModels += 1
    }

    for (const field of MODEL_FIELDS) {
      const normalizedField = normalizeModelFieldValue(pref[field], field, mappingByModelId)
      if (normalizedField.issue) {
        addIssue(report, {
          table: 'userPreference',
          rowId: pref.id,
          userId: pref.userId,
          ...normalizedField.issue,
        })
      }
      if (normalizedField.changed) {
        updateData[field] = normalizedField.nextValue
        report.userPreference.updatedDefaultFields += 1
      }
    }

    if (Object.keys(updateData).length > 0) {
      report.userPreference.updated += 1
      if (APPLY) {
        await prisma.userPreference.update({
          where: { id: pref.id },
          data: updateData,
        })
      }
    }
  }

  const projects = await prisma.novelPromotionProject.findMany({
    select: {
      id: true,
      projectId: true,
      analysisModel: true,
      characterModel: true,
      locationModel: true,
      storyboardModel: true,
      editModel: true,
      videoModel: true,
      project: {
        select: {
          userId: true,
        },
      },
    },
  })

  for (const row of projects as ProjectRow[]) {
    report.novelPromotionProject.scanned += 1
    const mappingByModelId = userMappings.get(row.project.userId) || new Map<string, string[]>()
    const updateData: Partial<Record<ModelField, string | null>> = {}

    for (const field of MODEL_FIELDS) {
      const normalizedField = normalizeModelFieldValue(row[field], field, mappingByModelId)
      if (normalizedField.issue) {
        addIssue(report, {
          table: 'novelPromotionProject',
          rowId: row.id,
          userId: row.project.userId,
          ...normalizedField.issue,
        })
      }
      if (normalizedField.changed) {
        updateData[field] = normalizedField.nextValue
        report.novelPromotionProject.updatedFields += 1
      }
    }

    if (Object.keys(updateData).length > 0) {
      report.novelPromotionProject.updated += 1
      if (APPLY) {
        await prisma.novelPromotionProject.update({
          where: { id: row.id },
          data: updateData,
        })
      }
    }
  }

  const absoluteReportPath = path.isAbsolute(reportPath)
    ? reportPath
    : path.join(process.cwd(), reportPath)
  fs.mkdirSync(path.dirname(absoluteReportPath), { recursive: true })
  fs.writeFileSync(absoluteReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  process.stdout.write(
    `[migrate-model-config-contract] mode=${report.mode} ` +
    `prefs=${report.userPreference.scanned}/${report.userPreference.updated} ` +
    `projects=${report.novelPromotionProject.scanned}/${report.novelPromotionProject.updated} ` +
    `issues=${report.issues.length} report=${absoluteReportPath}\n`,
  )
}

main()
  .catch((error) => {
    process.stderr.write(`[migrate-model-config-contract] failed: ${String(error)}\n`)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
