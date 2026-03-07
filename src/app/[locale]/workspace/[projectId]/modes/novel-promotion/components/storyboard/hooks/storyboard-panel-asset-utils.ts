'use client'

import { logError as _ulogError } from '@/lib/logging/core'
import { extractErrorMessage } from '@/lib/errors/extract'
import type {
  Character,
  Location,
  NovelPromotionClip,
} from '@/types/project'
import type { SelectedAsset } from './useImageGeneration'

export function getErrorMessage(error: unknown, fallback: string): string {
  return extractErrorMessage(error, fallback)
}

interface BuildDefaultAssetsForClipParams {
  clipId: string
  clips: NovelPromotionClip[]
  characters: Character[]
  locations: Location[]
}

export function buildDefaultAssetsForClip({
  clipId,
  clips,
  characters,
  locations,
}: BuildDefaultAssetsForClipParams): SelectedAsset[] {
  const clip = clips.find((item) => item.id === clipId)
  if (!clip) return []

  const assets: SelectedAsset[] = []

  if (clip.characters) {
    try {
      const characterNames: string[] = JSON.parse(clip.characters)
      for (const characterName of characterNames) {
        const character = characters.find(
          (item) => item.name.toLowerCase() === characterName.toLowerCase(),
        )
        if (!character?.appearances) continue

        const appearances = character.appearances || []
        const firstAppearance = appearances[0]
        if (!firstAppearance?.imageUrl) continue

        const displayName = appearances.length > 1 && firstAppearance.changeReason
          ? `${character.name} - ${firstAppearance.changeReason}`
          : character.name
        assets.push({
          id: character.id,
          name: displayName,
          type: 'character',
          imageUrl: firstAppearance.imageUrl,
          appearanceId: firstAppearance.appearanceIndex,
          appearanceName: firstAppearance.changeReason,
        })
      }
    } catch (error) {
      _ulogError('Failed to parse characters:', error)
    }
  }

  if (clip.location) {
    const location = locations.find(
      (item) => item.name.toLowerCase() === clip.location?.toLowerCase(),
    )
    if (!location?.images) return assets

    const selectedImage = location.selectedImageId
      ? location.images.find((image) => image.id === location.selectedImageId)
      : location.images.find((image) => image.isSelected) ||
        location.images.find((image) => image.imageUrl) ||
        location.images[0]

    if (selectedImage?.imageUrl) {
      assets.push({
        id: location.id,
        name: location.name,
        type: 'location',
        imageUrl: selectedImage.imageUrl,
      })
    }
  }

  return assets
}
