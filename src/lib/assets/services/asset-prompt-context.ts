import { buildCharactersIntroduction } from '@/lib/constants'
import {
  formatLocationAvailableSlotsText,
  parseLocationAvailableSlots,
} from '@/lib/location-available-slots'

type PromptLocale = 'zh' | 'en'

export type ClipCharacterRef = string | { name?: string | null }

export type PromptCharacterAppearance = {
  id?: string
  appearanceIndex?: number | null
  changeReason?: string | null
  descriptions?: string[] | string | null
  selectedIndex?: number | null
  description?: string | null
}

export type PromptCharacterAsset = {
  id?: string
  name: string
  appearances?: PromptCharacterAppearance[]
  introduction?: string | null
}

export type PromptLocationAsset = {
  name: string
  images?: Array<{
    isSelected?: boolean
    description?: string | null
    availableSlots?: string | null
  }>
}

export type PromptPropAsset = {
  name: string
  summary?: string | null
}

export type PromptAssetContextInput = {
  characters: PromptCharacterAsset[]
  locations: PromptLocationAsset[]
  props: PromptPropAsset[]
  clipCharacters: ClipCharacterRef[]
  clipLocation: string | null
  clipProps: string[]
  locale?: PromptLocale
}

export type PromptAssetContext = {
  subjectNames: string[]
  environmentName: string | null
  propNames: string[]
  appearanceListText: string
  fullDescriptionText: string
  locationDescriptionText: string
  propsDescriptionText: string
  charactersIntroductionText: string
}

function extractCharacterNames(clipCharacters: ClipCharacterRef[]): string[] {
  return clipCharacters
    .map((item) => {
      if (typeof item === 'string') return item
      return typeof item.name === 'string' ? item.name : ''
    })
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeName(value: string): string {
  return value.toLowerCase().trim()
}

export function characterNameMatches(characterName: string, referenceName: string): boolean {
  const charLower = normalizeName(characterName)
  const refLower = normalizeName(referenceName)
  if (charLower === refLower) return true
  const charAliases = charLower.split('/').map((item) => item.trim()).filter(Boolean)
  const refAliases = refLower.split('/').map((item) => item.trim()).filter(Boolean)
  return refAliases.some((alias) => charAliases.includes(alias))
}

function parseDescriptions(raw: string[] | string | null | undefined): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === 'string')
  }
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

export function getFilteredPropsDescription(props: PromptPropAsset[], clipProps: string[]): string {
  if (clipProps.length === 0) return '无'
  const propNameSet = new Set(clipProps.map(normalizeName))
  const matched = props.filter((prop) => propNameSet.has(normalizeName(prop.name)))
  if (matched.length === 0) return '无'
  return matched
    .map((prop) => `【${prop.name}】${typeof prop.summary === 'string' && prop.summary.trim() ? prop.summary.trim() : '无描述'}`)
    .join('\n')
}

export function buildPromptAssetContext(input: PromptAssetContextInput): PromptAssetContext {
  const subjectNames = extractCharacterNames(input.clipCharacters)
  const propNames = input.clipProps.map((item) => item.trim()).filter(Boolean)
  const matchedCharacters = input.characters.filter((character) =>
    subjectNames.some((name) => characterNameMatches(character.name, name)),
  )
  const appearanceListText = subjectNames.length === 0
    ? '无'
    : matchedCharacters.map((character) => {
      const appearances = character.appearances ?? []
      if (appearances.length === 0) {
        return `${character.name}: ["初始形象"]`
      }
      const labels = appearances.map((appearance) => ({
        appearance: appearance.changeReason || '初始形象',
        ...(character.id ? { characterId: character.id } : {}),
        ...(appearance.id ? { appearanceId: appearance.id } : {}),
        ...(typeof appearance.appearanceIndex === 'number' ? { appearanceIndex: appearance.appearanceIndex } : {}),
      }))
      return `${character.name}${character.id ? ` (characterId: ${character.id})` : ''}: ${JSON.stringify(labels)}`
    }).join('\n') || '无'

  const fullDescriptionText = subjectNames.length === 0
    ? '无'
    : matchedCharacters.map((character) => {
      const appearances = character.appearances ?? []
      if (appearances.length === 0) {
        return `【${character.name}】无形象描述`
      }
      return appearances.map((appearance) => {
        const label = appearance.changeReason || '初始形象'
        const descriptions = parseDescriptions(appearance.descriptions)
        const selectedIndex = typeof appearance.selectedIndex === 'number' ? appearance.selectedIndex : 0
        const description = descriptions[selectedIndex] || appearance.description || '无描述'
        return `【${character.name} - ${label}】${description}`
      }).join('\n')
    }).join('\n') || '无'

  const environmentName = input.clipLocation
  const matchedLocation = environmentName
    ? input.locations.find((location) => normalizeName(location.name) === normalizeName(environmentName))
    : null
  const selectedImage = matchedLocation?.images?.find((image) => image.isSelected) ?? matchedLocation?.images?.[0]
  const locationDescription = selectedImage?.description || '无'
  const locationSlotsText = formatLocationAvailableSlotsText(
    parseLocationAvailableSlots(selectedImage?.availableSlots),
    input.locale ?? 'zh',
  )
  const locationDescriptionText = locationSlotsText
    ? `${locationDescription}\n\n${locationSlotsText}`
    : locationDescription

  return {
    subjectNames,
    environmentName,
    propNames,
    appearanceListText,
    fullDescriptionText,
    locationDescriptionText: environmentName ? locationDescriptionText : '无',
    propsDescriptionText: getFilteredPropsDescription(input.props, propNames),
    charactersIntroductionText: buildCharactersIntroduction(input.characters),
  }
}

export function compileAssetPromptFragments(context: PromptAssetContext) {
  return {
    appearanceListText: context.appearanceListText,
    fullDescriptionText: context.fullDescriptionText,
    locationDescriptionText: context.locationDescriptionText,
    propsDescriptionText: context.propsDescriptionText,
    charactersIntroductionText: context.charactersIntroductionText,
  }
}
