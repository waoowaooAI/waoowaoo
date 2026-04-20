import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'
import { attachMediaFieldsToGlobalVoice } from '@/lib/media/attach'
import { resolveMediaRefFromLegacyValue } from '@/lib/media/service'
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

export function createAssetHubVoiceLibraryOperations(): ProjectAgentOperationRegistry {
  return {
    asset_hub_list_voices: {
      id: 'asset_hub_list_voices',
      description: 'List global voices for the current user (optionally filtered by folderId).',
      tool: {
        selectable: true,
        defaultVisibility: 'extended',
        groups: ['asset-hub', 'read', 'voice'],
        tags: ['asset-hub', 'read', 'voice'],
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

        const voices = await prisma.globalVoice.findMany({
          where,
          orderBy: { createdAt: 'desc' },
        })

        const signedVoices = await Promise.all(
          voices.map((voice) => attachMediaFieldsToGlobalVoice(voice)),
        )

        return { voices: signedVoices }
      },
    },

    asset_hub_create_voice: {
      id: 'asset_hub_create_voice',
      description: 'Create a global voice entry for the current user.',
      sideEffects: { mode: 'act', risk: 'low' },
      scope: 'system',
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const body = input as unknown as Record<string, unknown>
        const name = normalizeString(body.name)
        if (!name) {
          throw new ApiError('INVALID_PARAMS')
        }

        const folderId = body.folderId !== undefined ? normalizeString(body.folderId) : ''
        if (folderId) {
          const folder = await prisma.globalAssetFolder.findUnique({
            where: { id: folderId },
            select: { id: true, userId: true },
          })
          if (!folder || folder.userId !== ctx.userId) {
            throw new ApiError('INVALID_PARAMS')
          }
        }

        const customVoiceUrl = typeof body.customVoiceUrl === 'string' ? body.customVoiceUrl : null
        const customVoiceMedia = await resolveMediaRefFromLegacyValue(customVoiceUrl)

        const voice = await prisma.globalVoice.create({
          data: {
            userId: ctx.userId,
            folderId: folderId || null,
            name,
            description: typeof body.description === 'string' && body.description.trim()
              ? body.description.trim()
              : null,
            voiceId: typeof body.voiceId === 'string' && body.voiceId.trim()
              ? body.voiceId.trim()
              : null,
            voiceType: typeof body.voiceType === 'string' && body.voiceType.trim()
              ? body.voiceType.trim()
              : 'qwen-designed',
            customVoiceUrl: customVoiceUrl || null,
            customVoiceMediaId: customVoiceMedia?.id || null,
            voicePrompt: typeof body.voicePrompt === 'string' && body.voicePrompt.trim()
              ? body.voicePrompt.trim()
              : null,
            gender: typeof body.gender === 'string' && body.gender.trim()
              ? body.gender.trim()
              : null,
            language: body.language === 'en' ? 'en' : 'zh',
          },
        })

        const withMedia = await attachMediaFieldsToGlobalVoice(voice)
        return { success: true, voice: withMedia }
      },
    },

    asset_hub_update_voice: {
      id: 'asset_hub_update_voice',
      description: 'Update a global voice entry (name/description/folderId).',
      sideEffects: { mode: 'act', risk: 'low' },
      scope: 'system',
      inputSchema: z.object({
        id: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const body = input as unknown as Record<string, unknown>
        const id = normalizeString(body.id)
        if (!id) {
          throw new ApiError('INVALID_PARAMS')
        }

        const voice = await prisma.globalVoice.findUnique({
          where: { id },
        })
        if (!voice) {
          throw new ApiError('NOT_FOUND')
        }
        if (voice.userId !== ctx.userId) {
          throw new ApiError('FORBIDDEN')
        }

        const updatedVoice = await prisma.globalVoice.update({
          where: { id },
          data: {
            name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : voice.name,
            description: body.description !== undefined
              ? (typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null)
              : voice.description,
            folderId: body.folderId !== undefined ? body.folderId : voice.folderId,
          },
        })

        return { success: true, voice: updatedVoice }
      },
    },

    asset_hub_delete_voice: {
      id: 'asset_hub_delete_voice',
      description: 'Delete a global voice entry.',
      sideEffects: {
        mode: 'act',
        risk: 'high',
        destructive: true,
        requiresConfirmation: true,
        confirmationSummary: '将删除该音色记录（不可恢复）。确认继续后请重新调用并传入 confirmed=true。',
      },
      scope: 'system',
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        id: z.string().min(1),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const voice = await prisma.globalVoice.findUnique({
          where: { id: input.id },
        })

        if (!voice) {
          throw new ApiError('NOT_FOUND')
        }
        if (voice.userId !== ctx.userId) {
          throw new ApiError('FORBIDDEN')
        }

        await prisma.globalVoice.delete({ where: { id: input.id } })
        return { success: true }
      },
    },
  }
}
