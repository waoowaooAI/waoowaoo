import fs from 'fs'
import path from 'path'
import { prisma } from '@/lib/prisma'

type JsonRecord = Record<string, unknown>

type CharacterAppearance = {
  id: string
  appearanceIndex: number
  changeReason: string
}

type ProjectCharacterAsset = {
  id: string
  name: string
  appearances: CharacterAppearance[]
}

type PanelCharacterReference = {
  characterId?: string
  name: string
  appearanceId?: string
  appearanceIndex?: number
  appearance?: string
  slot?: string
  [key: string]: unknown
}

type BindingIssue = {
  kind:
    | 'CHARACTERS_EMPTY'
    | 'CHARACTERS_JSON_INVALID'
    | 'CHARACTERS_NOT_ARRAY'
    | 'CHARACTER_REFERENCE_INVALID'
    | 'CHARACTER_NOT_FOUND'
    | 'CHARACTER_AMBIGUOUS'
    | 'APPEARANCE_NOT_FOUND'
    | 'APPEARANCE_AMBIGUOUS'
  index?: number
  input?: unknown
  message: string
}

type BindingResult = {
  changed: boolean
  value: PanelCharacterReference[] | null
  issues: BindingIssue[]
}

type Counters = {
  scanned: number
  changed: number
  updated: number
  alreadyBound: number
  empty: number
  invalid: number
  unresolved: number
}

type Summary = {
  generatedAt: string
  mode: 'dry-run' | 'apply'
  reportPath: string
  projectPanels: Counters
  supplementaryPanels: Counters
  graphArtifacts: Counters
}

type ProjectCharacterModel = {
  findMany: (args: unknown) => Promise<ProjectCharacterAsset[]>
}

type ProjectPanelRow = {
  id: string
  characters: string | null
  storyboard: {
    id: string
    episode: {
      projectId: string
    }
  }
}

type SupplementaryPanelRow = {
  id: string
  characters: string | null
  storyboard: {
    id: string
    episode: {
      projectId: string
    }
  }
}

type GraphArtifactRow = {
  id: string
  runId: string
  stepKey: string | null
  artifactType: string
  refId: string
  payload: unknown
  run: {
    projectId: string
  }
}

type MigrationDb = {
  projectCharacter: ProjectCharacterModel
  projectPanel: {
    findMany: (args: unknown) => Promise<ProjectPanelRow[]>
    update: (args: unknown) => Promise<unknown>
  }
  supplementaryPanel: {
    findMany: (args: unknown) => Promise<SupplementaryPanelRow[]>
    update: (args: unknown) => Promise<unknown>
  }
  graphArtifact: {
    findMany: (args: unknown) => Promise<GraphArtifactRow[]>
    update: (args: unknown) => Promise<unknown>
  }
  $disconnect: () => Promise<void>
}

const db = prisma as unknown as MigrationDb
const APPLY = process.argv.includes('--apply')
const BATCH_SIZE = readPositiveIntArg('--batch-size', 200)
const PROJECT_ID = readStringArg('--project')
const REPORT_PATH = readReportPath()
const REPORT_DIR = path.dirname(REPORT_PATH)

const summary: Summary = {
  generatedAt: new Date().toISOString(),
  mode: APPLY ? 'apply' : 'dry-run',
  reportPath: REPORT_PATH,
  projectPanels: createCounters(),
  supplementaryPanels: createCounters(),
  graphArtifacts: createCounters(),
}

const characterCache = new Map<string, ProjectCharacterAsset[]>()

function readStringArg(name: string): string | null {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1).trim() || null
  const index = process.argv.findIndex((arg) => arg === name)
  if (index >= 0) return process.argv[index + 1]?.trim() || null
  return null
}

function readPositiveIntArg(name: string, fallback: number): number {
  const raw = readStringArg(name)
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function readReportPath(): string {
  const raw = readStringArg('--report')
  if (raw) return raw
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `scripts/migrations/reports/storyboard-character-bindings-${stamp}.jsonl`
}

function createCounters(): Counters {
  return {
    scanned: 0,
    changed: 0,
    updated: 0,
    alreadyBound: 0,
    empty: 0,
    invalid: 0,
    unresolved: 0,
  }
}

function writeLog(event: JsonRecord) {
  fs.appendFileSync(REPORT_PATH, `${JSON.stringify({ ts: new Date().toISOString(), ...event })}\n`)
}

function normalizeName(value: string): string {
  return value.toLowerCase().trim()
}

function splitAliases(value: string): string[] {
  return value.split('/').map((item) => normalizeName(item)).filter(Boolean)
}

function readTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readAppearanceIndex(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.floor(value)
}

function parseCharacters(raw: string | null): { value: unknown[] | null; issues: BindingIssue[] } {
  if (!raw || !raw.trim()) {
    return { value: null, issues: [{ kind: 'CHARACTERS_EMPTY', message: 'characters is empty' }] }
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return { value: null, issues: [{ kind: 'CHARACTERS_NOT_ARRAY', input: parsed, message: 'characters JSON is not an array' }] }
    }
    return { value: parsed, issues: [] }
  } catch (error) {
    return {
      value: null,
      issues: [{
        kind: 'CHARACTERS_JSON_INVALID',
        message: error instanceof Error ? error.message : String(error),
      }],
    }
  }
}

function parseReference(item: unknown): PanelCharacterReference | null {
  if (typeof item === 'string') {
    const name = item.trim()
    return name ? { name } : null
  }
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const record = item as JsonRecord
  const characterId = readTrimmedString(record.characterId)
  const name = readTrimmedString(record.name) || readTrimmedString(record.canonicalName)
  const appearanceId = readTrimmedString(record.appearanceId)
  const appearanceIndex = readAppearanceIndex(record.appearanceIndex)
  const appearance = readTrimmedString(record.appearance) || readTrimmedString(record.canonicalAppearance)
  const slot = readTrimmedString(record.slot)
  if (!characterId && !name) return null
  return {
    ...record,
    ...(characterId ? { characterId } : {}),
    name: name || characterId || '',
    ...(appearanceId ? { appearanceId } : {}),
    ...(appearanceIndex !== null ? { appearanceIndex } : {}),
    ...(appearance ? { appearance } : {}),
    ...(slot ? { slot } : {}),
  }
}

function findCharacterCandidates(characters: ProjectCharacterAsset[], reference: PanelCharacterReference): ProjectCharacterAsset[] {
  if (reference.characterId) {
    return characters.filter((character) => character.id === reference.characterId)
  }

  const referenceName = normalizeName(reference.name)
  if (!referenceName) return []

  const exact = characters.filter((character) => normalizeName(character.name) === referenceName)
  if (exact.length > 0) return exact

  const referenceAliases = splitAliases(reference.name)
  return characters.filter((character) => {
    const characterAliases = splitAliases(character.name)
    return referenceAliases.some((alias) => characterAliases.includes(alias))
  })
}

function findAppearanceCandidates(
  appearances: CharacterAppearance[],
  reference: PanelCharacterReference,
): CharacterAppearance[] {
  if (reference.appearanceId) {
    return appearances.filter((appearance) => appearance.id === reference.appearanceId)
  }
  if (typeof reference.appearanceIndex === 'number') {
    return appearances.filter((appearance) => appearance.appearanceIndex === reference.appearanceIndex)
  }
  if (reference.appearance) {
    const target = normalizeName(reference.appearance)
    return appearances.filter((appearance) => normalizeName(appearance.changeReason) === target)
  }
  return appearances.length > 0 ? [appearances[0]] : []
}

function canonicalizeCharacters(raw: string | null, characters: ProjectCharacterAsset[]): BindingResult {
  const parsed = parseCharacters(raw)
  if (!parsed.value) return { changed: false, value: null, issues: parsed.issues }
  if (parsed.value.length === 0) return { changed: false, value: [], issues: [] }

  const issues: BindingIssue[] = []
  const next: PanelCharacterReference[] = []

  parsed.value.forEach((item, index) => {
    const reference = parseReference(item)
    if (!reference) {
      issues.push({ kind: 'CHARACTER_REFERENCE_INVALID', index, input: item, message: 'character reference is not readable' })
      return
    }

    const characterCandidates = findCharacterCandidates(characters, reference)
    if (characterCandidates.length === 0) {
      issues.push({ kind: 'CHARACTER_NOT_FOUND', index, input: reference, message: `no character matched ${reference.name || reference.characterId || 'unknown'}` })
      return
    }
    if (characterCandidates.length > 1) {
      issues.push({ kind: 'CHARACTER_AMBIGUOUS', index, input: reference, message: `multiple characters matched ${reference.name || reference.characterId || 'unknown'}` })
      return
    }

    const character = characterCandidates[0]
    const appearanceCandidates = findAppearanceCandidates(character.appearances || [], reference)
    if (appearanceCandidates.length === 0) {
      const appearanceLabel = reference.appearance || reference.appearanceId || String(reference.appearanceIndex ?? 'default')
      issues.push({ kind: 'APPEARANCE_NOT_FOUND', index, input: reference, message: `no appearance matched ${appearanceLabel} for ${character.name}` })
      return
    }
    if (appearanceCandidates.length > 1) {
      const appearanceLabel = reference.appearance || reference.appearanceId || String(reference.appearanceIndex ?? 'default')
      issues.push({ kind: 'APPEARANCE_AMBIGUOUS', index, input: reference, message: `multiple appearances matched ${appearanceLabel} for ${character.name}` })
      return
    }

    const appearance = appearanceCandidates[0]
    next.push({
      ...reference,
      characterId: character.id,
      name: character.name,
      appearanceId: appearance.id,
      appearanceIndex: appearance.appearanceIndex,
      appearance: appearance.changeReason || reference.appearance || '初始形象',
    })
  })

  if (issues.length > 0) return { changed: false, value: null, issues }
  return {
    changed: JSON.stringify(parsed.value) !== JSON.stringify(next),
    value: next,
    issues: [],
  }
}

function updateCounters(counters: Counters, result: BindingResult, applied: boolean) {
  counters.scanned += 1
  if (result.issues.some((issue) => issue.kind === 'CHARACTERS_EMPTY')) {
    counters.empty += 1
    return
  }
  if (result.issues.length > 0) {
    counters.invalid += 1
    counters.unresolved += 1
    return
  }
  if (!result.changed) {
    counters.alreadyBound += 1
    return
  }
  counters.changed += 1
  if (applied) counters.updated += 1
}

function resolveRowAction(result: BindingResult, applied: boolean): 'updated' | 'would_update' | 'unresolved' | 'skipped' {
  if (applied) return 'updated'
  if (result.issues.length > 0) return 'unresolved'
  if (result.changed) return 'would_update'
  return 'skipped'
}

async function getProjectCharacters(projectId: string): Promise<ProjectCharacterAsset[]> {
  const cached = characterCache.get(projectId)
  if (cached) return cached
  const characters = await db.projectCharacter.findMany({
    where: { projectId },
    select: {
      id: true,
      name: true,
      appearances: {
        orderBy: { appearanceIndex: 'asc' },
        select: {
          id: true,
          appearanceIndex: true,
          changeReason: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })
  characterCache.set(projectId, characters)
  return characters
}

async function migrateProjectPanels() {
  let cursor: string | undefined
  while (true) {
    const rows = await db.projectPanel.findMany({
      where: {
        characters: { not: null },
        ...(PROJECT_ID ? { storyboard: { episode: { projectId: PROJECT_ID } } } : {}),
      },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        characters: true,
        storyboard: {
          select: {
            id: true,
            episode: { select: { projectId: true } },
          },
        },
      },
    })
    if (rows.length === 0) break
    for (const row of rows) {
      const projectId = row.storyboard.episode.projectId
      const result = canonicalizeCharacters(row.characters, await getProjectCharacters(projectId))
      const shouldApply = APPLY && result.changed && result.value !== null && result.issues.length === 0
      if (shouldApply) {
        await db.projectPanel.update({
          where: { id: row.id },
          data: { characters: JSON.stringify(result.value) },
        })
      }
      updateCounters(summary.projectPanels, result, shouldApply)
      writeLog({
        table: 'project_panels',
        rowId: row.id,
        projectId,
        action: resolveRowAction(result, shouldApply),
        changed: result.changed,
        issueCount: result.issues.length,
        issues: result.issues,
        migratedCharacters: result.value,
      })
    }
    cursor = rows[rows.length - 1]?.id
  }
}

async function migrateSupplementaryPanels() {
  let cursor: string | undefined
  while (true) {
    const rows = await db.supplementaryPanel.findMany({
      where: {
        characters: { not: null },
        ...(PROJECT_ID ? { storyboard: { episode: { projectId: PROJECT_ID } } } : {}),
      },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        characters: true,
        storyboard: {
          select: {
            id: true,
            episode: { select: { projectId: true } },
          },
        },
      },
    })
    if (rows.length === 0) break
    for (const row of rows) {
      const projectId = row.storyboard.episode.projectId
      const result = canonicalizeCharacters(row.characters, await getProjectCharacters(projectId))
      const shouldApply = APPLY && result.changed && result.value !== null && result.issues.length === 0
      if (shouldApply) {
        await db.supplementaryPanel.update({
          where: { id: row.id },
          data: { characters: JSON.stringify(result.value) },
        })
      }
      updateCounters(summary.supplementaryPanels, result, shouldApply)
      writeLog({
        table: 'supplementary_panels',
        rowId: row.id,
        projectId,
        action: resolveRowAction(result, shouldApply),
        changed: result.changed,
        issueCount: result.issues.length,
        issues: result.issues,
        migratedCharacters: result.value,
      })
    }
    cursor = rows[rows.length - 1]?.id
  }
}

function migrateArtifactPayload(payload: unknown, characters: ProjectCharacterAsset[]): BindingResult & { payload: unknown } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      changed: false,
      value: null,
      issues: [{ kind: 'CHARACTERS_NOT_ARRAY', message: 'artifact payload is not an object' }],
      payload,
    }
  }
  const record = payload as JsonRecord
  if (!Array.isArray(record.panels)) {
    return {
      changed: false,
      value: null,
      issues: [{ kind: 'CHARACTERS_NOT_ARRAY', message: 'artifact payload.panels is not an array' }],
      payload,
    }
  }

  let changed = false
  const issues: BindingIssue[] = []
  const panels = record.panels.map((panel, panelIndex) => {
    if (!panel || typeof panel !== 'object' || Array.isArray(panel)) return panel
    const panelRecord = panel as JsonRecord
    if (panelRecord.characters === undefined || panelRecord.characters === null) return panel
    const result = canonicalizeCharacters(JSON.stringify(panelRecord.characters), characters)
    if (result.issues.length > 0) {
      issues.push(...result.issues.map((issue) => ({
        ...issue,
        index: panelIndex,
        message: `panel ${panelIndex + 1}: ${issue.message}`,
      })))
      return panel
    }
    if (!result.changed || result.value === null) return panel
    changed = true
    return {
      ...panelRecord,
      characters: result.value,
    }
  })

  return {
    changed,
    value: null,
    issues,
    payload: changed ? { ...record, panels } : payload,
  }
}

async function migrateGraphArtifacts() {
  let cursor: string | undefined
  while (true) {
    const rows = await db.graphArtifact.findMany({
      where: {
        artifactType: { in: ['storyboard.clip.phase1', 'storyboard.clip.phase3'] },
        ...(PROJECT_ID ? { run: { projectId: PROJECT_ID } } : {}),
      },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        runId: true,
        stepKey: true,
        artifactType: true,
        refId: true,
        payload: true,
        run: { select: { projectId: true } },
      },
    })
    if (rows.length === 0) break
    for (const row of rows) {
      const projectId = row.run.projectId
      const result = migrateArtifactPayload(row.payload, await getProjectCharacters(projectId))
      const shouldApply = APPLY && result.changed && result.issues.length === 0
      if (shouldApply) {
        await db.graphArtifact.update({
          where: { id: row.id },
          data: { payload: result.payload },
        })
      }
      updateCounters(summary.graphArtifacts, result, shouldApply)
      writeLog({
        table: 'graph_artifacts',
        rowId: row.id,
        runId: row.runId,
        stepKey: row.stepKey,
        artifactType: row.artifactType,
        refId: row.refId,
        projectId,
        action: resolveRowAction(result, shouldApply),
        changed: result.changed,
        issueCount: result.issues.length,
        issues: result.issues,
      })
    }
    cursor = rows[rows.length - 1]?.id
  }
}

async function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true })
  fs.writeFileSync(REPORT_PATH, '')
  writeLog({
    event: 'migration_started',
    mode: summary.mode,
    projectId: PROJECT_ID,
    batchSize: BATCH_SIZE,
  })

  await migrateProjectPanels()
  await migrateSupplementaryPanels()
  await migrateGraphArtifacts()

  writeLog({ event: 'migration_summary', summary })
  console.log(JSON.stringify(summary, null, 2))
  console.log(`Report written to ${REPORT_PATH}`)
  if (!APPLY) {
    console.log('Dry run only. Re-run with --apply to write changes.')
  }
}

main()
  .catch((error) => {
    writeLog({
      event: 'migration_failed',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    })
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
