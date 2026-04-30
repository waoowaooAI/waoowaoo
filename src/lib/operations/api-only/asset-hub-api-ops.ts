import { z } from 'zod'
import sharp from 'sharp'
import { ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { decodeImageUrlsFromDb, encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { PRIMARY_APPEARANCE_INDEX, isArtStyleValue } from '@/lib/constants'
import { buildCharacterDescriptionFields } from '@/lib/assets/description-fields'
import { generateUniqueKey, getSignedUrl, uploadObject } from '@/lib/storage'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'

type UploadFileLike = {
  name: string
  type: string
  arrayBuffer: () => Promise<ArrayBuffer>
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function isFileLike(value: unknown): value is UploadFileLike {
  if (!value || typeof value !== 'object') return false
  const file = value as Partial<UploadFileLike>
  return typeof file.name === 'string' && typeof file.type === 'string' && typeof file.arrayBuffer === 'function'
}

function parseAppearanceIndex(value: unknown): number | null {
  const num = toNumberOrNull(value)
  if (num === null) return null
  const int = Math.floor(num)
  return Number.isFinite(int) ? int : null
}

const SUPPORTED_AUDIO_MIME_TYPES: ReadonlySet<string> = new Set<string>([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/mp4',
])

const SUPPORTED_AUDIO_EXTS: ReadonlySet<string> = new Set<string>([
  'mp3',
  'wav',
  'ogg',
  'm4a',
  'aac',
])

function resolveExt(filename: string): string {
  const match = filename.toLowerCase().match(/\\.([a-z0-9]+)$/)
  return match?.[1] || ''
}

function isSupportedAudioUpload(file: UploadFileLike): boolean {
  const ext = resolveExt(file.name)
  if (ext && SUPPORTED_AUDIO_EXTS.has(ext)) return true
  const mime = normalizeString(file.type)
  return mime ? SUPPORTED_AUDIO_MIME_TYPES.has(mime) : false
}

export function createAssetHubApiOperations(): ProjectAgentOperationRegistryDraft {
  return {
    api_asset_hub_update_asset_label_disabled: defineOperation({
      id: 'api_asset_hub_update_asset_label_disabled',
      summary: 'API-only: Legacy /asset-hub/update-asset-label disabled endpoint.',
      intent: 'act',
      effects: {
        writes: false,
        billable: false,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: false,
        longRunning: false,
      },
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.unknown(),
      execute: async () => {
        throw new ApiError('INVALID_PARAMS', {
          code: 'GLOBAL_ASSET_LABEL_UPDATES_DISABLED',
          message: 'Global asset images no longer support label updates',
        })
      },
    }),

    api_asset_hub_upload_temp: defineOperation({
      id: 'api_asset_hub_upload_temp',
      summary: 'API-only: Upload a temporary base64 blob and return signed url.',
      intent: 'act',
      effects: {
        writes: true,
        billable: false,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: true,
        longRunning: false,
      },
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const body = input as unknown as Record<string, unknown>
        const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : ''
        const base64 = typeof body.base64 === 'string' ? body.base64 : ''
        const extension = typeof body.extension === 'string' ? body.extension.trim() : ''

        let buffer: Buffer
	        let ext: string
	
	        if (imageBase64) {
	          const matches = imageBase64.match(/^data:image\/(\w+);base64,(.+)$/)
	          if (!matches) throw new ApiError('INVALID_PARAMS')
	          ext = matches[1] === 'jpeg' ? 'jpg' : matches[1]
	          buffer = Buffer.from(matches[2], 'base64')
	        } else if (base64 && extension) {
          buffer = Buffer.from(base64, 'base64')
          ext = extension
        } else {
          throw new ApiError('INVALID_PARAMS')
        }

        const key = generateUniqueKey(`temp-${ctx.userId}-${Date.now()}`, ext)
        await uploadObject(buffer, key)
        const signedUrl = getSignedUrl(key, 3600)
        return { success: true, url: signedUrl, key }
      },
    }),

    api_asset_hub_character_appearances_create: defineOperation({
      id: 'api_asset_hub_character_appearances_create',
      summary: 'API-only: Create a global character appearance (legacy /asset-hub/appearances POST).',
      intent: 'act',
      effects: {
        writes: true,
        billable: false,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: false,
        longRunning: false,
      },
      inputSchema: z.object({
        characterId: z.string().min(1),
        changeReason: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const description = normalizeString((input as unknown as Record<string, unknown>).description)
        const inputArtStyle = normalizeString((input as unknown as Record<string, unknown>).artStyle)

        const character = await prisma.globalCharacter.findFirst({
          where: { id: input.characterId, userId: ctx.userId },
          include: { appearances: true },
        })
        if (!character) throw new ApiError('NOT_FOUND')

        const maxIndex = character.appearances.reduce((max, appearance) => Math.max(max, appearance.appearanceIndex), 0)
        const nextIndex = maxIndex + 1
        const inheritedArtStyle = (() => {
          if (inputArtStyle) return inputArtStyle
          const primary = character.appearances.find((item) => item.appearanceIndex === PRIMARY_APPEARANCE_INDEX)
            || character.appearances[0]
          return normalizeString(primary?.artStyle)
        })()
        if (!isArtStyleValue(inheritedArtStyle)) {
          throw new ApiError('INVALID_PARAMS', {
            code: 'INVALID_ART_STYLE',
            message: 'artStyle is required and must be a supported value',
          })
        }

        const trimmed = description ? description.trim() : ''
        const appearance = await prisma.globalCharacterAppearance.create({
          data: {
            characterId: input.characterId,
            appearanceIndex: nextIndex,
            changeReason: input.changeReason,
            artStyle: inheritedArtStyle,
            description: trimmed || null,
            descriptions: trimmed ? JSON.stringify([trimmed]) : null,
            imageUrls: encodeImageUrls([]),
            previousImageUrls: encodeImageUrls([]),
          },
        })

        return { success: true, appearance }
      },
    }),

    api_asset_hub_character_appearances_update: defineOperation({
      id: 'api_asset_hub_character_appearances_update',
      summary: 'API-only: Update a global character appearance (legacy /asset-hub/appearances PATCH).',
      intent: 'act',
      effects: {
        writes: true,
        billable: false,
        destructive: false,
        overwrite: true,
        bulk: false,
        externalSideEffects: false,
        longRunning: false,
      },
      inputSchema: z.object({
        characterId: z.string().min(1),
        appearanceIndex: z.number().int().min(0),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const body = input as unknown as Record<string, unknown>
        const character = await prisma.globalCharacter.findFirst({
          where: { id: input.characterId, userId: ctx.userId },
          select: { id: true },
        })
        if (!character) throw new ApiError('NOT_FOUND')

        const appearance = await prisma.globalCharacterAppearance.findFirst({
          where: { characterId: input.characterId, appearanceIndex: input.appearanceIndex },
        })
        if (!appearance) throw new ApiError('NOT_FOUND')

        const updateData: Record<string, unknown> = {}
        if (body.description !== undefined) {
          if (typeof body.description !== 'string') throw new ApiError('INVALID_PARAMS')
          const descriptionFields = buildCharacterDescriptionFields({
            descriptions: appearance.descriptions ?? null,
            fallbackDescription: appearance.description ?? null,
            index: 0,
            nextDescription: body.description.trim(),
          })
          updateData.description = descriptionFields.description
          updateData.descriptions = descriptionFields.descriptions
        }
        if (body.changeReason !== undefined) {
          updateData.changeReason = body.changeReason
        }
        if (body.artStyle !== undefined) {
          if (typeof body.artStyle !== 'string') {
            throw new ApiError('INVALID_PARAMS', {
              code: 'INVALID_ART_STYLE',
              message: 'artStyle must be a supported value',
            })
          }
          const normalizedArtStyle = body.artStyle.trim()
          if (!isArtStyleValue(normalizedArtStyle)) {
            throw new ApiError('INVALID_PARAMS', {
              code: 'INVALID_ART_STYLE',
              message: 'artStyle must be a supported value',
            })
          }
          updateData.artStyle = normalizedArtStyle
        }

        await prisma.globalCharacterAppearance.update({
          where: { id: appearance.id },
          data: updateData,
        })

        return { success: true }
      },
    }),

    api_asset_hub_character_appearances_delete: defineOperation({
      id: 'api_asset_hub_character_appearances_delete',
      summary: 'API-only: Delete a global character appearance (legacy /asset-hub/appearances DELETE).',
      intent: 'act',
      effects: {
        writes: true,
        billable: false,
        destructive: true,
        overwrite: false,
        bulk: false,
        externalSideEffects: false,
        longRunning: false,
      },
      inputSchema: z.object({
        characterId: z.string().min(1),
        appearanceIndex: z.number().int().min(0),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const character = await prisma.globalCharacter.findFirst({
          where: { id: input.characterId, userId: ctx.userId },
          select: { id: true },
        })
        if (!character) throw new ApiError('NOT_FOUND')

        if (input.appearanceIndex === PRIMARY_APPEARANCE_INDEX) {
          throw new ApiError('INVALID_PARAMS')
        }

        await prisma.globalCharacterAppearance.deleteMany({
          where: { characterId: input.characterId, appearanceIndex: input.appearanceIndex },
        })

        return { success: true }
      },
    }),

    api_asset_hub_upload_image: defineOperation({
      id: 'api_asset_hub_upload_image',
      summary: 'API-only: Upload a custom image into global character appearance or global location image slots.',
      intent: 'act',
      effects: {
        writes: true,
        billable: false,
        destructive: false,
        overwrite: true,
        bulk: false,
        externalSideEffects: true,
        longRunning: false,
      },
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx) => {
        let formData: FormData
        try {
          formData = await ctx.request.formData()
        } catch {
          throw new ApiError('INVALID_PARAMS', {
            code: 'FORMDATA_PARSE_FAILED',
            message: 'request body must be valid multipart/form-data',
          })
        }

        const file = formData.get('file')
        const type = normalizeString(formData.get('type'))
        const id = normalizeString(formData.get('id'))
        const appearanceIndexRaw = formData.get('appearanceIndex')
        const imageIndexRaw = formData.get('imageIndex')
        const labelText = normalizeString(formData.get('labelText'))

        if (!isFileLike(file) || !type || !id || (type === 'location' && !labelText.trim())) {
          throw new ApiError('INVALID_PARAMS')
        }

        const appearanceIndex = parseAppearanceIndex(appearanceIndexRaw)
        const imageIndex = parseAppearanceIndex(imageIndexRaw)

        const buffer = Buffer.from(await file.arrayBuffer())
        const processed = await sharp(buffer)
          .jpeg({ quality: 90, mozjpeg: true })
          .toBuffer()

        const keyPrefix = type === 'character'
          ? `global-char-${id}-${appearanceIndex ?? 'na'}-upload`
          : `global-loc-${id}-upload`
        const key = generateUniqueKey(keyPrefix, 'jpg')
        await uploadObject(processed, key)

        if (type === 'character') {
          if (appearanceIndex === null) throw new ApiError('INVALID_PARAMS')
          const appearance = await prisma.globalCharacterAppearance.findFirst({
            where: {
              characterId: id,
              appearanceIndex,
              character: { userId: ctx.userId },
            },
            select: {
              id: true,
              imageUrl: true,
              imageUrls: true,
              selectedIndex: true,
              previousImageUrl: true,
              previousImageUrls: true,
            },
          })
          if (!appearance) throw new ApiError('NOT_FOUND')

          const currentImageUrls = decodeImageUrlsFromDb(appearance.imageUrls, 'globalCharacterAppearance.imageUrls')
          if (appearance.imageUrl || currentImageUrls.length > 0) {
            await prisma.globalCharacterAppearance.update({
              where: { id: appearance.id },
              data: {
                previousImageUrl: appearance.imageUrl,
                previousImageUrls: appearance.imageUrls,
              },
            })
          }

          const imageUrls = [...currentImageUrls]
          const targetIndex = imageIndex !== null ? imageIndex : imageUrls.length
          while (imageUrls.length <= targetIndex) imageUrls.push('')
          imageUrls[targetIndex] = key

          const selectedIndex = appearance.selectedIndex
          const shouldUpdateImageUrl =
            selectedIndex === targetIndex
            || (selectedIndex === null && targetIndex === 0)
            || imageUrls.filter((u) => !!u).length === 1

          const updateData: Record<string, unknown> = { imageUrls: encodeImageUrls(imageUrls) }
          if (shouldUpdateImageUrl) updateData.imageUrl = key

          await prisma.globalCharacterAppearance.update({
            where: { id: appearance.id },
            data: updateData,
          })

          return { success: true, imageKey: key, imageIndex: targetIndex }
        }

        if (type === 'location') {
          const location = await prisma.globalLocation.findFirst({
            where: { id, userId: ctx.userId },
            include: { images: { orderBy: { imageIndex: 'asc' } } },
          })
          if (!location) throw new ApiError('NOT_FOUND')

          if (imageIndex !== null) {
            const existingImage = location.images.find((img) => img.imageIndex === imageIndex)
            if (existingImage) {
              if (existingImage.imageUrl) {
                await prisma.globalLocationImage.update({
                  where: { id: existingImage.id },
                  data: { previousImageUrl: existingImage.imageUrl },
                })
              }
              await prisma.globalLocationImage.update({
                where: { id: existingImage.id },
                data: { imageUrl: key },
              })
            } else {
              await prisma.globalLocationImage.create({
                data: {
                  locationId: id,
                  imageIndex,
                  imageUrl: key,
                  description: labelText,
                  isSelected: imageIndex === 0,
                },
              })
            }
            return { success: true, imageKey: key, imageIndex }
          }

          const maxIndex = location.images.length
          await prisma.globalLocationImage.create({
            data: {
              locationId: id,
              imageIndex: maxIndex,
              imageUrl: key,
              description: labelText,
              isSelected: maxIndex === 0,
            },
          })
          return { success: true, imageKey: key, imageIndex: maxIndex }
        }

        throw new ApiError('INVALID_PARAMS')
      },
    }),

    api_asset_hub_character_voice_post: defineOperation({
      id: 'api_asset_hub_character_voice_post',
      summary: 'API-only: Upload/update global character voice settings (legacy /asset-hub/character-voice POST).',
      intent: 'act',
      effects: {
        writes: true,
        billable: false,
        destructive: false,
        overwrite: true,
        bulk: false,
        externalSideEffects: true,
        longRunning: false,
      },
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx) => {
        const contentType = normalizeString(ctx.request.headers.get('content-type'))

        if (contentType.includes('application/json')) {
          const body = await ctx.request.json() as unknown
          if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError('INVALID_PARAMS')
          const record = body as Record<string, unknown>
          const characterId = normalizeString(record.characterId)
          const voiceDesign = record.voiceDesign
          if (!characterId || !voiceDesign || typeof voiceDesign !== 'object' || Array.isArray(voiceDesign)) {
            throw new ApiError('INVALID_PARAMS')
          }
          const design = voiceDesign as Record<string, unknown>
          const voiceId = normalizeString(design.voiceId)
          const audioBase64 = normalizeString(design.audioBase64)
          if (!voiceId || !audioBase64) throw new ApiError('INVALID_PARAMS')

          const character = await prisma.globalCharacter.findFirst({
            where: { id: characterId, userId: ctx.userId },
            select: { id: true },
          })
          if (!character) throw new ApiError('NOT_FOUND')

          const audioBuffer = Buffer.from(audioBase64, 'base64')
          const key = generateUniqueKey(`global-voice/${ctx.userId}/${characterId}`, 'wav')
          const storageKey = await uploadObject(audioBuffer, key)

          await prisma.globalCharacter.update({
            where: { id: characterId },
            data: {
              voiceType: 'qwen-designed',
              voiceId,
              customVoiceUrl: storageKey,
            },
          })

          const signedAudioUrl = getSignedUrl(storageKey, 7200)
          return { success: true, audioUrl: signedAudioUrl }
        }

        let formData: FormData
        try {
          formData = await ctx.request.formData()
        } catch {
          throw new ApiError('INVALID_PARAMS', {
            code: 'FORMDATA_PARSE_FAILED',
            message: 'request body must be valid multipart/form-data',
          })
        }

        const file = formData.get('file')
        const characterId = normalizeString(formData.get('characterId'))
        if (!isFileLike(file) || !characterId) throw new ApiError('INVALID_PARAMS')

        const character = await prisma.globalCharacter.findFirst({
          where: { id: characterId, userId: ctx.userId },
          select: { id: true },
        })
        if (!character) throw new ApiError('NOT_FOUND')

        if (!isSupportedAudioUpload(file)) {
          throw new ApiError('INVALID_PARAMS', {
            code: 'UNSUPPORTED_AUDIO_FILE',
            message: 'file must be an audio type (.mp3/.wav/.ogg/.m4a/.aac)',
          })
        }

        const ext = resolveExt(file.name) || 'mp3'
        const storedExt = SUPPORTED_AUDIO_EXTS.has(ext) ? ext : 'mp3'
        const buffer = Buffer.from(await file.arrayBuffer())
        const key = generateUniqueKey(`global-voice/${ctx.userId}/${characterId}`, storedExt)
        const storageKey = await uploadObject(buffer, key)

        await prisma.globalCharacter.update({
          where: { id: characterId },
          data: {
            voiceType: 'uploaded',
            voiceId: null,
            customVoiceUrl: storageKey,
          },
        })

        const signedAudioUrl = getSignedUrl(storageKey, 7200)
        return { success: true, audioUrl: signedAudioUrl }
      },
    }),

    api_asset_hub_character_voice_patch: defineOperation({
      id: 'api_asset_hub_character_voice_patch',
      summary: 'API-only: Update global character voice binding fields (legacy /asset-hub/character-voice PATCH).',
      intent: 'act',
      effects: {
        writes: true,
        billable: false,
        destructive: false,
        overwrite: true,
        bulk: false,
        externalSideEffects: false,
        longRunning: false,
      },
      inputSchema: z.object({
        characterId: z.string().min(1),
        voiceType: z.string().nullable().optional(),
        voiceId: z.string().nullable().optional(),
        customVoiceUrl: z.string().nullable().optional(),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const character = await prisma.globalCharacter.findFirst({
          where: { id: input.characterId, userId: ctx.userId },
          select: { id: true },
        })
        if (!character) throw new ApiError('NOT_FOUND')

        await prisma.globalCharacter.update({
          where: { id: input.characterId },
          data: {
            voiceType: input.voiceType || null,
            voiceId: input.voiceId || null,
            customVoiceUrl: input.customVoiceUrl || null,
          },
        })

        return { success: true }
      },
    }),
  }
}
