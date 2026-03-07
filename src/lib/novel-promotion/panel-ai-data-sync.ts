export interface PanelCharacterRef {
  name: string
  appearance: string
}

type JsonRecord = Record<string, unknown>

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function parseStructuredJsonFromString(raw: string, fieldName: string): unknown {
  const trimmed = raw.trim()
  if (!trimmed) return null

  let parsed: unknown = trimmed
  for (let depth = 0; depth < 2 && typeof parsed === 'string'; depth += 1) {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      throw new Error(`${fieldName} must be valid JSON`)
    }
  }

  if (typeof parsed === 'string') {
    throw new Error(`${fieldName} must be JSON object/array, not a plain string`)
  }
  return parsed
}

function normalizeStructuredJsonInput(value: unknown, fieldName: string): unknown {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string') {
    return parseStructuredJsonFromString(value, fieldName)
  }
  return value
}

function assertStructuredJsonValue(value: unknown, fieldName: string): asserts value is JsonRecord | unknown[] | null {
  if (value === null) return
  const isStructured = Array.isArray(value) || isJsonRecord(value)
  assert(isStructured, `${fieldName} must be a JSON object or array`)
}

function assertNameRecord(value: unknown, fieldName: string): asserts value is JsonRecord & { name: string } {
  assert(isJsonRecord(value), `${fieldName} item must be an object`)
  assert(typeof value.name === 'string' && value.name.trim().length > 0, `${fieldName} item.name must be a non-empty string`)
}

function filterNamedRecordsBySet(
  source: unknown[],
  keepNames: ReadonlySet<string>,
  fieldName: string,
): JsonRecord[] {
  return source
    .map((item) => {
      assertNameRecord(item, fieldName)
      return item
    })
    .filter((item) => keepNames.has(item.name))
}

function syncActingNotesJson(
  actingNotesJson: string | null | undefined,
  keepNames: ReadonlySet<string>,
): string | null | undefined {
  if (actingNotesJson === undefined) return undefined
  const parsed = normalizeStructuredJsonInput(actingNotesJson, 'actingNotes')
  assertStructuredJsonValue(parsed, 'actingNotes')
  if (parsed === null) return null

  if (Array.isArray(parsed)) {
    const filtered = filterNamedRecordsBySet(parsed, keepNames, 'actingNotes')
    return JSON.stringify(filtered)
  }

  assert(isJsonRecord(parsed), 'actingNotes must be a JSON object or array')
  const maybeCharacters = parsed.characters
  if (maybeCharacters === undefined) {
    return JSON.stringify(parsed)
  }

  assert(Array.isArray(maybeCharacters), 'actingNotes.characters must be an array')
  const filtered = filterNamedRecordsBySet(maybeCharacters, keepNames, 'actingNotes.characters')
  return JSON.stringify({
    ...parsed,
    characters: filtered,
  })
}

function syncPhotographyRulesJson(
  photographyRulesJson: string | null | undefined,
  keepNames: ReadonlySet<string>,
): string | null | undefined {
  if (photographyRulesJson === undefined) return undefined
  const parsed = normalizeStructuredJsonInput(photographyRulesJson, 'photographyRules')
  assertStructuredJsonValue(parsed, 'photographyRules')
  if (parsed === null) return null
  assert(isJsonRecord(parsed), 'photographyRules must be a JSON object')

  const maybeCharacters = parsed.characters
  if (maybeCharacters === undefined) {
    return JSON.stringify(parsed)
  }

  assert(Array.isArray(maybeCharacters), 'photographyRules.characters must be an array')
  const filtered = filterNamedRecordsBySet(maybeCharacters, keepNames, 'photographyRules.characters')
  return JSON.stringify({
    ...parsed,
    characters: filtered,
  })
}

export function serializeStructuredJsonField(value: unknown, fieldName: string): string | null {
  const normalized = normalizeStructuredJsonInput(value, fieldName)
  assertStructuredJsonValue(normalized, fieldName)
  return normalized === null ? null : JSON.stringify(normalized)
}

export interface SyncPanelCharacterDependentJsonInput {
  characters: PanelCharacterRef[]
  removeIndex: number
  actingNotesJson?: string | null
  photographyRulesJson?: string | null
}

export interface SyncPanelCharacterDependentJsonResult {
  characters: PanelCharacterRef[]
  actingNotesJson?: string | null
  photographyRulesJson?: string | null
}

export function syncPanelCharacterDependentJson({
  characters,
  removeIndex,
  actingNotesJson,
  photographyRulesJson,
}: SyncPanelCharacterDependentJsonInput): SyncPanelCharacterDependentJsonResult {
  const nextCharacters = characters.filter((_, index) => index !== removeIndex)
  const keepNames = new Set(nextCharacters.map((character) => character.name))

  return {
    characters: nextCharacters,
    actingNotesJson: syncActingNotesJson(actingNotesJson, keepNames),
    photographyRulesJson: syncPhotographyRulesJson(photographyRulesJson, keepNames),
  }
}
