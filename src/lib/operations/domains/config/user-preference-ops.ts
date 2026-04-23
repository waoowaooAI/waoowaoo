import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'
import { isArtStyleValue } from '@/lib/constants'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function validateArtStyleField(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ApiError('INVALID_PARAMS', {
      code: 'INVALID_ART_STYLE',
      field: 'artStyle',
      message: 'artStyle must be a supported value',
    })
  }
  const artStyle = value.trim()
  if (!isArtStyleValue(artStyle)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'INVALID_ART_STYLE',
      field: 'artStyle',
      message: 'artStyle must be a supported value',
    })
  }
  return artStyle
}

const ALLOWED_FIELDS: ReadonlyArray<string> = [
  'analysisModel',
  'characterModel',
  'locationModel',
  'storyboardModel',
  'editModel',
  'videoModel',
  'audioModel',
  'lipSyncModel',
  'videoRatio',
  'artStyle',
]

export function createUserPreferenceOperations(): ProjectAgentOperationRegistryDraft {
  return {
    get_user_preference: defineOperation({
      id: 'get_user_preference',
      summary: 'Get or initialize the current user preference record.',
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
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx) => {
        const preference = await prisma.userPreference.upsert({
          where: { userId: ctx.userId },
          update: {},
          create: { userId: ctx.userId },
        })

        return { preference }
      },
    }),

    update_user_preference: defineOperation({
      id: 'update_user_preference',
      summary: 'Update allowed fields of the current user preference record.',
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
      confirmation: {
        required: true,
        summary: '将覆盖更新用户偏好设置（例如模型与画风等）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const body = isRecord(input) ? input : {}

        const updateData: Record<string, unknown> = {}
        for (const field of ALLOWED_FIELDS) {
          if (!Object.prototype.hasOwnProperty.call(body, field)) continue
          const value = body[field]
          if (value === undefined) continue
          if (field === 'artStyle') {
            updateData[field] = validateArtStyleField(value)
            continue
          }
          updateData[field] = value
        }

        if (Object.keys(updateData).length === 0) {
          throw new ApiError('INVALID_PARAMS')
        }

        const preference = await prisma.userPreference.upsert({
          where: { userId: ctx.userId },
          update: updateData,
          create: { userId: ctx.userId, ...updateData },
        })

        return { preference }
      },
    }),
  }
}
