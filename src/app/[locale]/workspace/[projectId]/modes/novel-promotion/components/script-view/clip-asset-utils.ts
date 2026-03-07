type ClipAssetSource = {
  characters?: string | null
  location?: string | null
}

export type ParsedClipAssets = {
  charNames: Set<string>
  locNames: Set<string>
  charAppearanceSet: Set<string>
}

export function fuzzyMatchLocation(clipLocName: string, libraryLocName: string): boolean {
  const clipLower = clipLocName.toLowerCase().trim()
  const libLower = libraryLocName.toLowerCase().trim()

  if (clipLower === libLower) return true
  if (clipLower.includes(libLower)) return true
  if (libLower.includes(clipLower)) return true

  const suffixPattern = /[_\-·](内景|外景|白天|夜晚|黄昏|清晨|傍晚|雨天|晴天|阴天|室内|室外|日|夜|晨|昏)+$/gi
  const clipClean = clipLower.replace(suffixPattern, '')
  const libClean = libLower.replace(suffixPattern, '')
  if (clipClean === libClean) return true
  if (clipClean.includes(libClean) || libClean.includes(clipClean)) return true

  return false
}

export function parseClipAssets(clip: ClipAssetSource): ParsedClipAssets {
  const charNames = new Set<string>()
  const locNames = new Set<string>()
  const charAppearanceSet = new Set<string>()

  if (clip.characters) {
    try {
      const parsed = JSON.parse(clip.characters)
      if (Array.isArray(parsed)) {
        parsed.forEach((item) => {
          const record =
            item && typeof item === 'object'
              ? (item as { name?: unknown; appearance?: unknown })
              : null
          const name = typeof item === 'string' ? item : record?.name
          const appearance = typeof item === 'string' ? null : record?.appearance
          if (name) {
            const trimmed = String(name).trim()
            if (trimmed) {
              charNames.add(trimmed)
              if (typeof appearance === 'string' && appearance.trim()) {
                charAppearanceSet.add(`${trimmed}::${appearance}`)
              }
            }
          }
        })
      }
    } catch {
      clip.characters.split(',').forEach(name => {
        const trimmed = name.trim()
        if (trimmed) charNames.add(trimmed)
      })
    }
  }

  if (clip.location) {
    try {
      const parsed = JSON.parse(clip.location)
      if (Array.isArray(parsed)) {
        parsed.forEach((loc: string) => locNames.add(loc.trim()))
      } else {
        clip.location.split(',').forEach(loc => {
          const trimmed = loc.trim()
          if (trimmed) locNames.add(trimmed)
        })
      }
    } catch {
      clip.location.split(',').forEach(loc => {
        const trimmed = loc.trim()
        if (trimmed) locNames.add(trimmed)
      })
    }
  }

  return { charNames, locNames, charAppearanceSet }
}

export function getAllClipsAssets(clips: ClipAssetSource[]) {
  const allCharNames = new Set<string>()
  const allLocNames = new Set<string>()
  const allCharAppearanceSet = new Set<string>()

  clips.forEach((clip) => {
    const { charNames, locNames, charAppearanceSet } = parseClipAssets(clip)
    charNames.forEach(n => allCharNames.add(n))
    locNames.forEach(n => allLocNames.add(n))
    charAppearanceSet.forEach(k => allCharAppearanceSet.add(k))
  })

  return { allCharNames, allLocNames, allCharAppearanceSet }
}
