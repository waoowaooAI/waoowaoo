import type { CharacterAppearance } from '@/types/project'
import type { Character, Location } from '@/lib/query/hooks'

const MANUAL_REGENERATE_TIMEOUT_MS = 90_000

export type ManualRegenerationBaseline = {
  signature: string
  startedAt: number
}

function createCharacterGroupSignature(appearance: CharacterAppearance) {
  return JSON.stringify({
    imageUrl: appearance.imageUrl || null,
    imageUrls: appearance.imageUrls || [],
    imageErrorMessage: appearance.imageErrorMessage || null,
  })
}

function createLocationGroupSignature(location: Location) {
  const normalizedImages = (location.images || []).map((image) => ({
    imageIndex: image.imageIndex,
    imageUrl: image.imageUrl || null,
    imageErrorMessage: image.imageErrorMessage || null,
  }))
  return JSON.stringify({
    images: normalizedImages,
  })
}

export function createManualKeyBaseline(
  key: string,
  characters: Character[],
  locations: Location[],
): ManualRegenerationBaseline | null {
  const characterMatch = /^character-(.+)-(\d+)-(group|\d+)$/.exec(key)
  if (characterMatch) {
    const [, characterId, appearanceIndexRaw, suffix] = characterMatch
    const appearanceIndex = Number.parseInt(appearanceIndexRaw, 10)
    const character = characters.find((item) => item.id === characterId)
    const appearance = character?.appearances?.find((item) => item.appearanceIndex === appearanceIndex)
    if (!character || !appearance) return null
    const groupSignature = createCharacterGroupSignature(appearance)
    if (suffix === 'group') return { signature: groupSignature, startedAt: Date.now() }
    const imageIndex = Number.parseInt(suffix, 10)
    if (!Number.isFinite(imageIndex)) return null
    const imageUrl = appearance.imageUrls?.[imageIndex] || null
    return {
      signature: JSON.stringify({
        imageUrl,
        imageErrorMessage: appearance.imageErrorMessage || null,
      }),
      startedAt: Date.now(),
    }
  }

  const locationMatch = /^location-(.+)-(group|\d+)$/.exec(key)
  if (locationMatch) {
    const [, locationId, suffix] = locationMatch
    const location = locations.find((item) => item.id === locationId)
    if (!location) return null
    const groupSignature = createLocationGroupSignature(location)
    if (suffix === 'group') return { signature: groupSignature, startedAt: Date.now() }
    const imageIndex = Number.parseInt(suffix, 10)
    if (!Number.isFinite(imageIndex)) return null
    const image = location.images?.find((item) => item.imageIndex === imageIndex)
    return {
      signature: JSON.stringify({
        imageUrl: image?.imageUrl || null,
        imageErrorMessage: image?.imageErrorMessage || null,
      }),
      startedAt: Date.now(),
    }
  }

  return null
}

export function isAppearanceTaskRunning(appearance: CharacterAppearance) {
  return Boolean((appearance as CharacterAppearance & { imageTaskRunning?: boolean })['imageTaskRunning'])
}

export function shouldResolveManualKey(
  key: string,
  characters: Character[],
  locations: Location[],
  baselines: Map<string, ManualRegenerationBaseline>,
  now: number,
) {
  const baseline = baselines.get(key)
  if (!baseline) return true
  const current = createManualKeyBaseline(key, characters, locations)
  if (!current) return true

  if (now - baseline.startedAt > MANUAL_REGENERATE_TIMEOUT_MS) {
    return true
  }

  const characterMatch = /^character-(.+)-(\d+)-(group|\d+)$/.exec(key)
  if (characterMatch) {
    const [, characterId, appearanceIndexRaw] = characterMatch
    const appearanceIndex = Number.parseInt(appearanceIndexRaw, 10)
    const character = characters.find((item) => item.id === characterId)
    const appearance = character?.appearances?.find((item) => item.appearanceIndex === appearanceIndex)
    if (!appearance) return true
    if (isAppearanceTaskRunning(appearance)) return true
    if (appearance.imageErrorMessage) return true
    return current.signature !== baseline.signature
  }

  const locationMatch = /^location-(.+)-(group|\d+)$/.exec(key)
  if (locationMatch) {
    const [, locationId, suffix] = locationMatch
    const location = locations.find((item) => item.id === locationId)
    if (!location) return true
    const imageIndex = Number.parseInt(suffix, 10)
    if (suffix === 'group') {
      const hasRunningTask = !!location.images?.some((item) => item.imageTaskRunning)
      const hasError = !!location.images?.some((item) => !!item.imageErrorMessage)
      if (hasRunningTask || hasError) return true
      return current.signature !== baseline.signature
    }
    if (!Number.isFinite(imageIndex)) return true
    const image = location.images?.find((item) => item.imageIndex === imageIndex)
    if (!image) return true
    if (image.imageTaskRunning || image.imageErrorMessage) return true
    return current.signature !== baseline.signature
  }

  return true
}
