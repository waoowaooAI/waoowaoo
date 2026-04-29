export type StoryboardCharacterAppearanceLike = {
  id?: string
  appearanceIndex?: number | null
  changeReason?: string | null
}

export type StoryboardCharacterLike = {
  id?: string
  name: string
  appearances?: StoryboardCharacterAppearanceLike[]
}

export type StoryboardPanelCharacterReference = {
  characterId?: string
  name: string
  appearanceId?: string
  appearanceIndex?: number
  appearance?: string
  slot?: string
}

function readTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readAppearanceIndex(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.floor(value)
}

function parseReferenceItem(item: unknown): StoryboardPanelCharacterReference | null {
  if (typeof item === 'string') {
    const name = item.trim()
    return name ? { name } : null
  }
  if (!item || typeof item !== 'object') return null
  const candidate = item as Record<string, unknown>
  const characterId = readTrimmedString(candidate.characterId)
  const name = readTrimmedString(candidate.name) || readTrimmedString(candidate.canonicalName)
  const appearanceId = readTrimmedString(candidate.appearanceId)
  const appearanceIndex = readAppearanceIndex(candidate.appearanceIndex)
  const appearance = readTrimmedString(candidate.appearance) || readTrimmedString(candidate.canonicalAppearance)
  const slot = readTrimmedString(candidate.slot)
  if (!characterId && !name) return null
  return {
    ...(characterId ? { characterId } : {}),
    name: name || characterId || '',
    ...(appearanceId ? { appearanceId } : {}),
    ...(appearanceIndex !== undefined
      ? { appearanceIndex }
      : {}),
    ...(appearance
      ? { appearance }
      : {}),
    ...(slot ? { slot } : {}),
  }
}

export function parseStoryboardPanelCharacterReferences(value: unknown): StoryboardPanelCharacterReference[] {
  const parsed = (() => {
    if (typeof value !== 'string') return value
    if (!value.trim()) return []
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  })()
  if (typeof parsed === 'string') {
    const single = parseReferenceItem(parsed)
    return single ? [single] : []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.map(parseReferenceItem).filter((item): item is StoryboardPanelCharacterReference => item !== null)
}

export function findCharacterForStoryboardReference<T extends StoryboardCharacterLike>(
  characters: T[],
  reference: StoryboardPanelCharacterReference,
): T | undefined {
  if (!reference.characterId) return undefined
  return characters.find((character) => character.id === reference.characterId)
}

export function findAppearanceForStoryboardReference<T extends StoryboardCharacterAppearanceLike>(
  appearances: T[],
  reference: StoryboardPanelCharacterReference,
): T | undefined {
  if (reference.appearanceId) {
    return appearances.find((appearance) => appearance.id === reference.appearanceId)
  }
  if (typeof reference.appearanceIndex === 'number') {
    return appearances.find((appearance) => appearance.appearanceIndex === reference.appearanceIndex)
  }
  return undefined
}

export function canonicalizePanelCharacterReferences(
  characters: StoryboardCharacterLike[],
  value: unknown,
  context = 'panel',
): StoryboardPanelCharacterReference[] | null {
  const references = parseStoryboardPanelCharacterReferences(value)
  if (references.length === 0) return null

  return references.map((reference, index) => {
    const character = findCharacterForStoryboardReference(characters, reference)
    if (!character) {
      throw new Error(`STORYBOARD_CHARACTER_BINDING_INVALID:${context}:character:${index + 1}:${reference.name || reference.characterId || 'unknown'}`)
    }
    const appearance = findAppearanceForStoryboardReference(character.appearances || [], reference)
    if (!appearance) {
      const appearanceLabel = reference.appearance || reference.appearanceId || String(reference.appearanceIndex ?? 'default')
      throw new Error(`STORYBOARD_CHARACTER_BINDING_INVALID:${context}:appearance:${index + 1}:${character.name}:${appearanceLabel}`)
    }
    return {
      characterId: character.id || reference.characterId,
      name: character.name,
      appearanceId: appearance.id || reference.appearanceId,
      appearanceIndex: typeof appearance.appearanceIndex === 'number' ? appearance.appearanceIndex : reference.appearanceIndex,
      appearance: appearance.changeReason || reference.appearance || '初始形象',
      ...(reference.slot ? { slot: reference.slot } : {}),
    }
  })
}

export function canonicalizeStoryboardPanels<T extends { characters?: unknown; panel_number?: number }>(
  panels: T[],
  characters: StoryboardCharacterLike[],
  context: string,
): T[] {
  return panels.map((panel, index) => {
    const canonicalCharacters = canonicalizePanelCharacterReferences(
      characters,
      panel.characters,
      `${context}:panel_${panel.panel_number || index + 1}`,
    )
    return canonicalCharacters ? { ...panel, characters: canonicalCharacters } : panel
  })
}
