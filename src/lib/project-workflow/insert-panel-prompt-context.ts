import {
  formatLocationAvailableSlotsText,
  parseLocationAvailableSlots,
} from '@/lib/location-available-slots'

type PromptLocationImage = {
  isSelected?: boolean
  description?: string | null
  availableSlots?: string | null
}

type PromptLocationAsset = {
  name: string
  images?: PromptLocationImage[]
}

type Locale = 'zh' | 'en'

export function buildInsertPanelLocationsDescription(
  locations: PromptLocationAsset[],
  relatedLocations: string[],
  locale: Locale = 'zh',
): string {
  const filteredLocations = locations.filter(
    (location) => relatedLocations.length === 0 || relatedLocations.includes(location.name),
  )

  if (filteredLocations.length === 0) {
    return '无'
  }

  return filteredLocations
    .map((location) => {
      const selectedImage = location.images?.find((image) => image.isSelected) ?? location.images?.[0]
      const description = selectedImage?.description || '无描述'
      const slotsText = formatLocationAvailableSlotsText(
        parseLocationAvailableSlots(selectedImage?.availableSlots),
        locale,
      )

      return slotsText
        ? `${location.name}: ${description}\n${slotsText}`
        : `${location.name}: ${description}`
    })
    .join('\n')
}
