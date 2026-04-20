import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'
import type { ProjectAgentOperationRegistry } from './types'

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function createAssetHubFolderOperations(): ProjectAgentOperationRegistry {
  return {
    asset_hub_list_folders: {
      id: 'asset_hub_list_folders',
      description: 'List global asset folders for the current user.',
      sideEffects: { mode: 'query', risk: 'low' },
      scope: 'system',
      inputSchema: z.object({}),
      outputSchema: z.unknown(),
      execute: async (ctx) => {
        const folders = await prisma.globalAssetFolder.findMany({
          where: { userId: ctx.userId },
          orderBy: { name: 'asc' },
        })
        return { folders }
      },
    },

    asset_hub_create_folder: {
      id: 'asset_hub_create_folder',
      description: 'Create a global asset folder for the current user.',
      sideEffects: { mode: 'act', risk: 'low' },
      scope: 'system',
      inputSchema: z.object({
        name: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const name = normalizeString(input.name)
        if (!name) {
          throw new ApiError('INVALID_PARAMS')
        }
        const folder = await prisma.globalAssetFolder.create({
          data: {
            userId: ctx.userId,
            name,
          },
        })
        return { success: true, folder }
      },
    },

    asset_hub_update_folder: {
      id: 'asset_hub_update_folder',
      description: 'Update a global asset folder name.',
      sideEffects: { mode: 'act', risk: 'low' },
      scope: 'system',
      inputSchema: z.object({
        folderId: z.string().min(1),
        name: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const name = normalizeString(input.name)
        if (!name) {
          throw new ApiError('INVALID_PARAMS')
        }

        const folder = await prisma.globalAssetFolder.findUnique({
          where: { id: input.folderId },
          select: { id: true, userId: true },
        })
        if (!folder || folder.userId !== ctx.userId) {
          throw new ApiError('FORBIDDEN')
        }

        const updatedFolder = await prisma.globalAssetFolder.update({
          where: { id: input.folderId },
          data: { name },
        })
        return { success: true, folder: updatedFolder }
      },
    },

    asset_hub_delete_folder: {
      id: 'asset_hub_delete_folder',
      description: 'Delete a global asset folder and move assets to root.',
      sideEffects: {
        mode: 'act',
        risk: 'high',
        destructive: true,
        bulk: true,
        requiresConfirmation: true,
        confirmationSummary: '将删除该资产文件夹（文件夹内资产会移动到根目录）。确认继续后请重新调用并传入 confirmed=true。',
      },
      scope: 'system',
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        folderId: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const folder = await prisma.globalAssetFolder.findUnique({
          where: { id: input.folderId },
          select: { id: true, userId: true },
        })

        if (!folder || folder.userId !== ctx.userId) {
          throw new ApiError('FORBIDDEN')
        }

        await prisma.globalCharacter.updateMany({
          where: { folderId: input.folderId },
          data: { folderId: null },
        })

        await prisma.globalLocation.updateMany({
          where: { folderId: input.folderId },
          data: { folderId: null },
        })

        await prisma.globalAssetFolder.delete({
          where: { id: input.folderId },
        })

        return { success: true }
      },
    },
  }
}

