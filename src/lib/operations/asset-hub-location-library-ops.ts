import { z } from 'zod'
import { ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { attachMediaFieldsToGlobalLocation } from '@/lib/media/attach'
import { isArtStyleValue } from '@/lib/constants'
import { normalizeImageGenerationCount } from '@/lib/image-generation/count'
import { normalizeLocationAvailableSlots, stringifyLocationAvailableSlots } from '@/lib/location-available-slots'
import type { ProjectAgentOperationRegistry } from './types'

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeFolderFilter(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  const text = normalizeString(value)
  if (!text) return undefined
  if (text === 'null') return null
  return text
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

export function createAssetHubLocationLibraryOperations(): ProjectAgentOperationRegistry {
  return {
    asset_hub_list_locations: {
      id: 'asset_hub_list_locations',
      description: 'List global locations for the current user (optionally filtered by folderId).',
      tool: {
        selectable: true,
        defaultVisibility: 'extended',
        groups: ['asset-hub', 'read', 'location'],
        tags: ['asset-hub', 'read', 'location'],
      },
      sideEffects: { mode: 'query', risk: 'low' },
      scope: 'system',
      inputSchema: z.object({
        folderId: z.string().optional(),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const folderId = normalizeFolderFilter((input as unknown as Record<string, unknown>).folderId)

        const where: Record<string, unknown> = { userId: ctx.userId }
        if (folderId === null) {
          where.folderId = null
        } else if (typeof folderId === 'string') {
          where.folderId = folderId
        }

        const locations = await prisma.globalLocation.findMany({
          where,
          include: { images: true },
          orderBy: { createdAt: 'desc' },
        })

        const signedLocations = await Promise.all(
          locations.map((location) => attachMediaFieldsToGlobalLocation(location)),
        )

        return { locations: signedLocations }
      },
    },

    asset_hub_create_location: {
      id: 'asset_hub_create_location',
      description: 'Create a global location and its initial image placeholders.',
      sideEffects: { mode: 'act', risk: 'medium' },
      scope: 'system',
      inputSchema: z.object({
        name: z.string().min(1),
        artStyle: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const body = input as unknown as Record<string, unknown>
        const name = normalizeString(body.name)
        if (!name) throw new ApiError('INVALID_PARAMS')

        const normalizedArtStyle = normalizeString(body.artStyle)
        if (!isArtStyleValue(normalizedArtStyle)) {
          throw new ApiError('INVALID_PARAMS', {
            code: 'INVALID_ART_STYLE',
            message: 'artStyle is required and must be a supported value',
          })
        }

        const folderId = normalizeString(body.folderId) || null
        if (folderId) {
          const folder = await prisma.globalAssetFolder.findUnique({
            where: { id: folderId },
            select: { id: true, userId: true },
          })
          if (!folder || folder.userId !== ctx.userId) throw new ApiError('INVALID_PARAMS')
        }

        const summary = normalizeString(body.summary) || null
        const availableSlots = normalizeLocationAvailableSlots(body.availableSlots)
        const count = hasOwn(body, 'count')
          ? normalizeImageGenerationCount('location', body.count)
          : 1

        const location = await prisma.globalLocation.create({
          data: {
            userId: ctx.userId,
            folderId,
            name,
            artStyle: normalizedArtStyle,
            summary,
          },
        })

        await prisma.globalLocationImage.createMany({
          data: Array.from({ length: count }, (_value, imageIndex) => ({
            locationId: location.id,
            imageIndex,
            description: summary || name,
            availableSlots: stringifyLocationAvailableSlots(availableSlots),
          })),
        })

        const withImages = await prisma.globalLocation.findUnique({
          where: { id: location.id },
          include: { images: true },
        })

        const withMedia = withImages ? await attachMediaFieldsToGlobalLocation(withImages) : null
        return { success: true, location: withMedia }
      },
    },

    asset_hub_get_location: {
      id: 'asset_hub_get_location',
      description: 'Get a global location by id.',
      tool: {
        selectable: true,
        defaultVisibility: 'extended',
        groups: ['asset-hub', 'read', 'location'],
        tags: ['asset-hub', 'read', 'location'],
      },
      sideEffects: { mode: 'query', risk: 'low' },
      scope: 'system',
      inputSchema: z.object({
        locationId: z.string().min(1),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const location = await prisma.globalLocation.findUnique({
          where: { id: input.locationId },
          include: { images: true },
        })
        if (!location || location.userId !== ctx.userId) throw new ApiError('NOT_FOUND')
        const withMedia = await attachMediaFieldsToGlobalLocation(location)
        return { location: withMedia }
      },
    },

    asset_hub_update_location: {
      id: 'asset_hub_update_location',
      description: 'Update a global location (name/summary/folderId).',
      sideEffects: { mode: 'act', risk: 'medium' },
      scope: 'system',
      inputSchema: z.object({
        locationId: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const body = input as unknown as Record<string, unknown>
        const locationId = normalizeString(body.locationId)
        if (!locationId) throw new ApiError('INVALID_PARAMS')

        const location = await prisma.globalLocation.findUnique({
          where: { id: locationId },
          select: { id: true, userId: true },
        })
        if (!location) throw new ApiError('NOT_FOUND')
        if (location.userId !== ctx.userId) throw new ApiError('FORBIDDEN')

        const updateData: Record<string, unknown> = {}
        if (body.name !== undefined) {
          if (typeof body.name !== 'string') throw new ApiError('INVALID_PARAMS')
          updateData.name = body.name.trim()
        }
        if (body.summary !== undefined) {
          updateData.summary = typeof body.summary === 'string' && body.summary.trim() ? body.summary.trim() : null
        }
        if (body.folderId !== undefined) {
          const folderId = normalizeString(body.folderId) || null
          if (folderId) {
            const folder = await prisma.globalAssetFolder.findUnique({
              where: { id: folderId },
              select: { id: true, userId: true },
            })
            if (!folder || folder.userId !== ctx.userId) throw new ApiError('INVALID_PARAMS')
          }
          updateData.folderId = folderId
        }

        const updated = await prisma.globalLocation.update({
          where: { id: locationId },
          data: updateData,
          include: { images: true },
        })

        const withMedia = await attachMediaFieldsToGlobalLocation(updated)
        return { success: true, location: withMedia }
      },
    },

    asset_hub_delete_location: {
      id: 'asset_hub_delete_location',
      description: 'Delete a global location.',
      sideEffects: {
        mode: 'act',
        risk: 'high',
        destructive: true,
        requiresConfirmation: true,
        confirmationSummary: '将删除该场景记录（不可恢复）。确认继续后请重新调用并传入 confirmed=true。',
      },
      scope: 'system',
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        locationId: z.string().min(1),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const location = await prisma.globalLocation.findUnique({
          where: { id: input.locationId },
          select: { id: true, userId: true },
        })
        if (!location) throw new ApiError('NOT_FOUND')
        if (location.userId !== ctx.userId) throw new ApiError('FORBIDDEN')

        await prisma.globalLocation.delete({ where: { id: input.locationId } })
        return { success: true }
      },
    },
  }
}
