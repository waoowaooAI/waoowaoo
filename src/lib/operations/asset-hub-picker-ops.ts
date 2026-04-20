import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'
import { resolveMediaRefFromLegacyValue } from '@/lib/media/service'
import { decodeImageUrlsFromDb } from '@/lib/contracts/image-urls-contract'
import { PRIMARY_APPEARANCE_INDEX } from '@/lib/constants'
import type { ProjectAgentOperationRegistry } from './types'

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function createAssetHubPickerOperations(): ProjectAgentOperationRegistry {
  return {
    asset_hub_picker: {
      id: 'asset_hub_picker',
      description: 'List global assets for picker (character/location/voice) with preview URLs.',
      sideEffects: { mode: 'query', risk: 'low' },
      scope: 'system',
      inputSchema: z.object({
        type: z.enum(['character', 'location', 'voice']).optional(),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const type = normalizeString((input as unknown as Record<string, unknown>).type) || 'character'

        if (type === 'character') {
          const characters = await prisma.globalCharacter.findMany({
            where: { userId: ctx.userId },
            include: {
              appearances: { orderBy: { appearanceIndex: 'asc' } },
              folder: true,
            },
            orderBy: { updatedAt: 'desc' },
          })

          const processedCharacters = await Promise.all(characters.map(async (char) => {
            const primaryAppearance =
              char.appearances.find((a) => a.appearanceIndex === PRIMARY_APPEARANCE_INDEX)
              || char.appearances[0]

            let previewUrl: string | null = null
            if (primaryAppearance) {
              const urls = decodeImageUrlsFromDb(primaryAppearance.imageUrls, 'globalCharacterAppearance.imageUrls')
              const selectedUrl = urls[primaryAppearance.selectedIndex ?? 0] || urls[0] || primaryAppearance.imageUrl
              if (selectedUrl) {
                const media = await resolveMediaRefFromLegacyValue(selectedUrl)
                previewUrl = media?.url || selectedUrl
              }
            }

            return {
              id: char.id,
              name: char.name,
              folderName: char.folder?.name || null,
              previewUrl,
              appearanceCount: char.appearances.length,
              hasVoice: !!(char.voiceId || char.customVoiceUrl),
            }
          }))

          return { characters: processedCharacters }
        }

        if (type === 'location') {
          const locations = await prisma.globalLocation.findMany({
            where: { userId: ctx.userId },
            include: {
              images: { orderBy: { imageIndex: 'asc' } },
              folder: true,
            },
            orderBy: { updatedAt: 'desc' },
          })

          const processedLocations = await Promise.all(locations.map(async (loc) => {
            const selectedImage = loc.images.find((img) => img.isSelected) || loc.images[0]
            let previewUrl: string | null = null
            if (selectedImage?.imageUrl) {
              const media = await resolveMediaRefFromLegacyValue(selectedImage.imageUrl)
              previewUrl = media?.url || selectedImage.imageUrl
            }

            return {
              id: loc.id,
              name: loc.name,
              summary: loc.summary,
              folderName: loc.folder?.name || null,
              previewUrl,
              imageCount: loc.images.length,
            }
          }))

          return { locations: processedLocations }
        }

        if (type === 'voice') {
          const voices = await prisma.globalVoice.findMany({
            where: { userId: ctx.userId },
            include: { folder: true },
            orderBy: { updatedAt: 'desc' },
          })

          const processedVoices = await Promise.all(voices.map(async (voice) => {
            let previewUrl: string | null = null
            if (voice.customVoiceUrl) {
              const media = await resolveMediaRefFromLegacyValue(voice.customVoiceUrl)
              previewUrl = media?.url || voice.customVoiceUrl
            }

            return {
              id: voice.id,
              name: voice.name,
              description: voice.description,
              folderName: voice.folder?.name || null,
              previewUrl,
              voiceId: voice.voiceId,
              voiceType: voice.voiceType,
              gender: voice.gender,
              language: voice.language,
            }
          }))

          return { voices: processedVoices }
        }

        throw new ApiError('INVALID_PARAMS')
      },
    },
  }
}

