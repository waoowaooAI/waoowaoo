import { z } from 'zod'
import { ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { PRIMARY_APPEARANCE_INDEX, isArtStyleValue } from '@/lib/constants'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseAppearanceIndex(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed >= 0) return parsed
  }
  throw new ApiError('INVALID_PARAMS')
}

function parseDescriptions(jsonValue: unknown): string[] {
  if (typeof jsonValue !== 'string' || !jsonValue.trim()) return []
  try {
    const parsed = JSON.parse(jsonValue)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function createAssetHubCharacterAppearanceOperations(): ProjectAgentOperationRegistryDraft {
  return {
    asset_hub_update_character_appearance: defineOperation({
      id: 'asset_hub_update_character_appearance',
      summary: 'Update a global character appearance description/changeReason/artStyle.',
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
        appearanceIndex: z.union([z.number().int().min(0), z.string().min(1)]),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const body = input as unknown as Record<string, unknown>
        const characterId = normalizeString(body.characterId)
        const appearanceIndex = parseAppearanceIndex(body.appearanceIndex)

        const character = await prisma.globalCharacter.findUnique({
          where: { id: characterId },
          select: { id: true, userId: true },
        })
        if (!character || character.userId !== ctx.userId) throw new ApiError('FORBIDDEN')

        const appearance = await prisma.globalCharacterAppearance.findFirst({
          where: { characterId, appearanceIndex },
        })
        if (!appearance) throw new ApiError('NOT_FOUND')

        const updateData: Record<string, unknown> = {}
        if (body.description !== undefined) {
          if (typeof body.description !== 'string') throw new ApiError('INVALID_PARAMS')
          const trimmedDescription = body.description.trim()
          const descriptions = (() => {
            const existing = parseDescriptions(appearance.descriptions)
            if (existing.length > 0) return existing
            return [typeof appearance.description === 'string' ? appearance.description : '']
          })()

          const indexRaw = body.descriptionIndex
          const index = typeof indexRaw === 'number' && Number.isInteger(indexRaw) && indexRaw >= 0 ? indexRaw : null
          if (index !== null) {
            while (descriptions.length <= index) {
              descriptions.push('')
            }
            descriptions[index] = trimmedDescription
          } else {
            descriptions[0] = trimmedDescription
          }
          updateData.descriptions = JSON.stringify(descriptions)
          updateData.description = descriptions[0]
        }

        if (body.changeReason !== undefined) updateData.changeReason = body.changeReason

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

    asset_hub_add_character_appearance: defineOperation({
      id: 'asset_hub_add_character_appearance',
      summary: 'Add a new appearance to a global character.',
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
        description: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const body = input as unknown as Record<string, unknown>
        const characterId = normalizeString(body.characterId)
        const description = normalizeString(body.description)
        if (!characterId || !description) throw new ApiError('INVALID_PARAMS')

        const character = await prisma.globalCharacter.findUnique({
          where: { id: characterId },
          include: { appearances: true },
        })
        if (!character || character.userId !== ctx.userId) throw new ApiError('FORBIDDEN')

        const maxIndex = character.appearances.reduce((max, appearance) => Math.max(max, appearance.appearanceIndex), 0)
        const newIndex = maxIndex + 1

        const inputArtStyle = normalizeString(body.artStyle)
        const fallbackArtStyle = (() => {
          if (inputArtStyle) return inputArtStyle
          const primary = character.appearances.find((item) => item.appearanceIndex === PRIMARY_APPEARANCE_INDEX)
            || character.appearances[0]
          return normalizeString(primary?.artStyle)
        })()

        if (!isArtStyleValue(fallbackArtStyle)) {
          throw new ApiError('INVALID_PARAMS', {
            code: 'INVALID_ART_STYLE',
            message: 'artStyle is required and must be a supported value',
          })
        }

        const appearance = await prisma.globalCharacterAppearance.create({
          data: {
            characterId,
            appearanceIndex: newIndex,
            changeReason: normalizeString(body.changeReason) || '形象变化',
            artStyle: fallbackArtStyle,
            description,
            descriptions: JSON.stringify([description]),
            imageUrls: encodeImageUrls([]),
            previousImageUrls: encodeImageUrls([]),
          },
        })

        return { success: true, appearance }
      },
    }),

    asset_hub_delete_character_appearance: defineOperation({
      id: 'asset_hub_delete_character_appearance',
      summary: 'Delete a global character appearance by index.',
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
      confirmation: {
        required: true,
        summary: '将删除该角色形象记录（不可恢复）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        characterId: z.string().min(1),
        appearanceIndex: z.union([z.number().int().min(0), z.string().min(1)]),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const appearanceIndex = parseAppearanceIndex(input.appearanceIndex)

        const character = await prisma.globalCharacter.findUnique({
          where: { id: input.characterId },
          include: { appearances: true },
        })
        if (!character || character.userId !== ctx.userId) throw new ApiError('FORBIDDEN')

        if (character.appearances.length <= 1) throw new ApiError('INVALID_PARAMS')

        const appearance = await prisma.globalCharacterAppearance.findFirst({
          where: { characterId: input.characterId, appearanceIndex },
          select: { id: true },
        })
        if (!appearance) throw new ApiError('NOT_FOUND')

        await prisma.globalCharacterAppearance.delete({ where: { id: appearance.id } })
        return { success: true }
      },
    }),
  }
}
