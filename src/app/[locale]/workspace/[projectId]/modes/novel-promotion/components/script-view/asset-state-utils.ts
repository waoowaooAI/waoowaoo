import type { Character, CharacterAppearance, Location } from '@/types/project'
import { PRIMARY_APPEARANCE_INDEX } from '@/lib/constants'

interface ClipLike {
  characters: string | null
  location: string | null
}

export function getPrimaryAppearance(char: Character): CharacterAppearance | undefined {
  return char.appearances?.find((a) => a.appearanceIndex === PRIMARY_APPEARANCE_INDEX) || char.appearances?.[0]
}

export function getSelectedAppearances(
  char: Character,
  selectedAppearanceKeys: Set<string>,
): CharacterAppearance[] {
  const result: CharacterAppearance[] = []
  selectedAppearanceKeys.forEach((key) => {
    if (key.startsWith(`${char.id}::`)) {
      const appearanceName = key.split('::')[1]
      const matched = char.appearances?.find(
        (a) =>
          a.changeReason === appearanceName ||
          a.changeReason?.toLowerCase() === appearanceName.toLowerCase(),
      )
      if (matched) result.push(matched)
    }
  })

  if (result.length === 0) {
    const primary = getPrimaryAppearance(char)
    if (primary) result.push(primary)
  }
  return result
}

export function processCharacterInClip(params: {
  clip: ClipLike
  action: 'add' | 'remove'
  targetChar: Character
  appearanceName?: string
  characters: Character[]
  tAssets: (key: string) => string
}): string | null {
  const { clip, action, targetChar, appearanceName, characters, tAssets } = params
  let currentItems: Array<string | { name: string; appearance?: string }> = []
  try {
    currentItems = JSON.parse(clip.characters || '[]')
    if (!Array.isArray(currentItems)) throw new Error()
  } catch {
    currentItems = clip.characters
      ? clip.characters.split(',').map((s) => s.trim()).filter(Boolean)
      : []
  }

  const aliases = targetChar.name.split('/').map((a) => a.trim()).filter(Boolean)
  const clipNameSet = new Set<string>()
  currentItems.forEach((item) => {
    if (typeof item === 'string') {
      if (item.trim()) clipNameSet.add(item.trim())
    } else if (item?.name) {
      const n = String(item.name).trim()
      if (n) clipNameSet.add(n)
    }
  })

  const removeNameSet = new Set<string>()
  if (clipNameSet.has(targetChar.name)) removeNameSet.add(targetChar.name)
  aliases.forEach((a) => {
    if (clipNameSet.has(a)) removeNameSet.add(a)
  })
  const nameMatches = (name: string) => removeNameSet.has(name) || name === targetChar.name
  const primaryLabel = tAssets('character.primary')

  const finalAppearanceName =
    appearanceName ||
    (targetChar.appearances?.find((appearance) => appearance.appearanceIndex === PRIMARY_APPEARANCE_INDEX)?.changeReason ||
      tAssets('character.primary'))
  const isPrimaryAppearance =
    !appearanceName || appearanceName === primaryLabel

  const hasSameAppearance = currentItems.some((item) => {
    if (typeof item === 'string') {
      return isPrimaryAppearance && nameMatches(item)
    }
    return nameMatches(item.name) && item.appearance === finalAppearanceName
  })

  const beforeLen = currentItems.length

  if (action === 'add') {
    if (!hasSameAppearance) {
      currentItems.push({ name: targetChar.name, appearance: finalAppearanceName })
    }
  } else {
    currentItems = currentItems.filter((item) => {
      if (typeof item === 'string') {
        return !nameMatches(item)
      }
      if (!nameMatches(item.name)) return true
      if (!item.appearance) return !isPrimaryAppearance
      if (item.appearance === finalAppearanceName) return false
      if (
        isPrimaryAppearance &&
        item.appearance === primaryLabel
      ) {
        return false
      }
      return true
    })

    if (currentItems.length === beforeLen) {
      const candidates = characters
        .map((c) => {
          const cAliases = [c.name, ...c.name.split('/').map((a) => a.trim()).filter(Boolean)]
          if (!cAliases.includes(targetChar.name)) return null
          const intersect = cAliases.filter((a) => clipNameSet.has(a))
          if (intersect.length === 0) return null
          return { intersect }
        })
        .filter(Boolean) as Array<{ intersect: string[] }>

      if (candidates.length === 1) {
        const fallbackRemoveSet = new Set(candidates[0].intersect)
        currentItems = currentItems.filter((item) => {
          if (typeof item === 'string') {
            return !fallbackRemoveSet.has(item)
          }
          if (!fallbackRemoveSet.has(item.name)) return true
          if (!item.appearance) return !isPrimaryAppearance
          if (item.appearance === finalAppearanceName) return false
          if (
            isPrimaryAppearance &&
            item.appearance === primaryLabel
          ) {
            return false
          }
          return true
        })
      }
    }
  }

  const newValue = JSON.stringify(currentItems)
  if (action === 'add' && hasSameAppearance) return null
  if (action === 'remove' && currentItems.length === beforeLen) return null
  return newValue
}

export function processLocationInClip(params: {
  clip: ClipLike
  action: 'add' | 'remove'
  targetLoc: Location
  locationName?: string
  fuzzyMatchLocation: (clipLocName: string, libraryLocName: string) => boolean
}): string | null {
  const { clip, action, targetLoc, locationName, fuzzyMatchLocation } = params
  let currentNames: string[] = []
  if (clip.location) {
    try {
      const parsed = JSON.parse(clip.location)
      if (Array.isArray(parsed)) {
        currentNames = parsed
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter(Boolean)
      } else {
        currentNames = clip.location.split(',').map((s) => s.trim()).filter(Boolean)
      }
    } catch {
      currentNames = clip.location.split(',').map((s) => s.trim()).filter(Boolean)
    }
  }

  const beforeLen = currentNames.length
  let newLocationNames: string[] = []

  if (action === 'add') {
    const finalLocationName = locationName?.trim() || targetLoc.name
    if (!currentNames.some((n) => fuzzyMatchLocation(n, targetLoc.name))) {
      newLocationNames = [...currentNames, finalLocationName]
    } else {
      return null
    }
  } else {
    newLocationNames = currentNames.filter((n) => !fuzzyMatchLocation(n, targetLoc.name))
    if (newLocationNames.length === beforeLen) return null
  }

  return newLocationNames.join(',')
}
