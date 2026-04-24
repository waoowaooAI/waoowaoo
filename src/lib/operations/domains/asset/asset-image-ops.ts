import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { submitAssetGenerateTask, submitAssetModifyTask } from '@/lib/assets/services/asset-actions'
import { createMutationBatch } from '@/lib/mutation-batch/service'
import type { TaskSubmittedPartData } from '@/lib/project-agent/types'
import type { ProjectAgentOperationContext, ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { writeOperationDataPart } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'
import {
  refineTaskSubmitOperationOutputSchema,
  taskSubmitOperationOutputSchemaBase,
} from '@/lib/operations/output-schemas'

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function resolveLocaleFromContext(locale?: unknown): string {
  const normalized = normalizeString(locale)
  return normalized || 'zh'
}

const modifyCharacterImageInputSchema = z.object({
  confirmed: z.boolean().optional(),
  characterId: z.string().min(1),
}).passthrough()

const modifyLocationImageInputSchema = z.object({
  confirmed: z.boolean().optional(),
  locationId: z.string().min(1),
}).passthrough()

async function executeAssetImageModificationOperation(params: {
  ctx: ProjectAgentOperationContext
  input: Record<string, unknown>
  operationId: string
  kind: 'character' | 'location'
}) {
  const assetId = params.kind === 'character'
    ? normalizeString(params.input.characterId)
    : normalizeString(params.input.locationId)

  if (!assetId) {
    throw new Error('PROJECT_AGENT_ASSET_ID_REQUIRED')
  }

  const body: Record<string, unknown> = {
    ...params.input,
    ...(params.kind === 'character' ? { characterId: assetId } : { locationId: assetId }),
  }
  delete body.confirmed

  const result = await submitAssetModifyTask({
    request: params.ctx.request,
    kind: params.kind,
    assetId,
    body,
    access: {
      scope: 'project',
      userId: params.ctx.userId,
      projectId: params.ctx.projectId,
    },
  })

  const appearanceId = params.kind === 'character' ? normalizeString(body.appearanceId) : ''
  const mutationBatch = await createMutationBatch({
    projectId: params.ctx.projectId,
    userId: params.ctx.userId,
    source: params.ctx.source,
    operationId: params.operationId,
    episodeId: null,
    summary: `${params.operationId}:${assetId}`,
    entries: [
      {
        kind: 'asset_render_revert',
        targetType: params.kind === 'character' ? 'ProjectCharacter' : 'ProjectLocation',
        targetId: assetId,
        payload: {
          kind: params.kind,
          assetId,
          ...(appearanceId ? { appearanceId } : {}),
        },
      },
    ],
  })

  writeOperationDataPart<TaskSubmittedPartData>(params.ctx.writer, 'data-task-submitted', {
    operationId: params.operationId,
    taskId: result.taskId,
    status: result.status,
    runId: result.runId || null,
    deduped: result.deduped,
    mutationBatchId: mutationBatch.id,
  })

  return {
    ...result,
    assetId,
    mutationBatchId: mutationBatch.id,
  }
}

export function createAssetImageOperations(): ProjectAgentOperationRegistryDraft {
  const withMutationBatchBase = taskSubmitOperationOutputSchemaBase.extend({
    mutationBatchId: z.string().min(1),
  }).passthrough()

  const taskSubmitOutputWithMutationBatch = <TShape extends z.ZodRawShape>(shape: TShape) => refineTaskSubmitOperationOutputSchema(
    withMutationBatchBase.extend(shape).passthrough(),
  )

  return {
    generate_character_image: defineOperation({
      id: 'generate_character_image',
      summary: 'Generate character appearance images for a project character.',
      intent: 'act',
      groupPath: ['asset', 'character'],
      effects: {
        writes: true,
        billable: true,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将为角色生成形象图片（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        characterId: z.string().min(1).optional(),
        characterName: z.string().min(1).optional(),
        appearanceId: z.string().min(1).optional(),
        appearanceIndex: z.number().int().min(0).max(20).optional(),
        count: z.number().int().positive().max(6).optional(),
        imageIndex: z.number().int().min(0).max(20).optional(),
        artStyle: z.string().optional(),
      }).refine((value) => Boolean(value.characterId || value.characterName), {
        message: 'characterId or characterName is required',
        path: ['characterId'],
      }),
      outputSchema: taskSubmitOutputWithMutationBatch({
        characterId: z.string().min(1),
        appearanceId: z.string().nullable(),
      }),
      execute: async (ctx, input) => {
        const locale = resolveLocaleFromContext(ctx.context.locale)

        let characterId = normalizeString(input.characterId)
        const characterName = normalizeString(input.characterName)
        if (!characterId) {
          const exact = await prisma.projectCharacter.findFirst({
            where: {
              projectId: ctx.projectId,
              name: characterName,
            },
            select: { id: true },
          })
          if (exact) {
            characterId = exact.id
          } else {
            const fuzzy = await prisma.projectCharacter.findFirst({
              where: {
                projectId: ctx.projectId,
                name: {
                  contains: characterName,
                },
              },
              select: { id: true },
            })
            if (fuzzy) {
              characterId = fuzzy.id
            }
          }
        }
        if (!characterId) {
          throw new Error('PROJECT_AGENT_CHARACTER_NOT_FOUND')
        }

        let appearanceId = normalizeString(input.appearanceId)
        if (!appearanceId) {
          const appearance = await prisma.characterAppearance.findFirst({
            where: { characterId },
            orderBy: { appearanceIndex: 'asc' },
            select: { id: true },
          })
          appearanceId = appearance?.id || ''
        }

        const body: Record<string, unknown> = {
          meta: {
            locale,
          },
          ...(appearanceId ? { appearanceId } : {}),
          ...(typeof input.appearanceIndex === 'number' ? { appearanceIndex: input.appearanceIndex } : {}),
          ...(typeof input.count === 'number' ? { count: input.count } : {}),
          ...(typeof input.imageIndex === 'number' ? { imageIndex: input.imageIndex } : {}),
          ...(normalizeString(input.artStyle) ? { artStyle: normalizeString(input.artStyle) } : {}),
        }

        const result = await submitAssetGenerateTask({
          request: ctx.request,
          kind: 'character',
          assetId: characterId,
          body,
          access: {
            scope: 'project',
            userId: ctx.userId,
            projectId: ctx.projectId,
          },
        })

        const mutationBatch = await createMutationBatch({
          projectId: ctx.projectId,
          userId: ctx.userId,
          source: ctx.source,
          operationId: 'generate_character_image',
          episodeId: null,
          summary: `generate_character_image:${characterId}`,
          entries: [
            {
              kind: 'asset_render_revert',
              targetType: 'ProjectCharacter',
              targetId: characterId,
              payload: {
                kind: 'character',
                assetId: characterId,
                appearanceId,
              },
            },
          ],
        })

        writeOperationDataPart<TaskSubmittedPartData>(ctx.writer, 'data-task-submitted', {
          operationId: 'generate_character_image',
          taskId: result.taskId,
          status: result.status,
          runId: result.runId || null,
          deduped: result.deduped,
          mutationBatchId: mutationBatch.id,
        })

        return {
          ...result,
          characterId,
          appearanceId: appearanceId || null,
          mutationBatchId: mutationBatch.id,
        }
      },
    }),

    generate_location_image: defineOperation({
      id: 'generate_location_image',
      summary: 'Generate location images for a project location.',
      intent: 'act',
      groupPath: ['asset', 'location'],
      effects: {
        writes: true,
        billable: true,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将为场景生成图片（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        locationId: z.string().min(1).optional(),
        locationName: z.string().min(1).optional(),
        count: z.number().int().positive().max(6).optional(),
        imageIndex: z.number().int().min(0).max(50).optional(),
        artStyle: z.string().optional(),
      }).refine((value) => Boolean(value.locationId || value.locationName), {
        message: 'locationId or locationName is required',
        path: ['locationId'],
      }),
      outputSchema: taskSubmitOutputWithMutationBatch({
        locationId: z.string().min(1),
      }),
      execute: async (ctx, input) => {
        const locale = resolveLocaleFromContext(ctx.context.locale)

        let locationId = normalizeString(input.locationId)
        const locationName = normalizeString(input.locationName)
        if (!locationId) {
          const exact = await prisma.projectLocation.findFirst({
            where: {
              projectId: ctx.projectId,
              name: locationName,
            },
            select: { id: true },
          })
          if (exact) {
            locationId = exact.id
          } else {
            const fuzzy = await prisma.projectLocation.findFirst({
              where: {
                projectId: ctx.projectId,
                name: {
                  contains: locationName,
                },
              },
              select: { id: true },
            })
            if (fuzzy) {
              locationId = fuzzy.id
            }
          }
        }
        if (!locationId) {
          throw new Error('PROJECT_AGENT_LOCATION_NOT_FOUND')
        }

        const body: Record<string, unknown> = {
          meta: {
            locale,
          },
          ...(typeof input.count === 'number' ? { count: input.count } : {}),
          ...(typeof input.imageIndex === 'number' ? { imageIndex: input.imageIndex } : {}),
          ...(normalizeString(input.artStyle) ? { artStyle: normalizeString(input.artStyle) } : {}),
        }

        const result = await submitAssetGenerateTask({
          request: ctx.request,
          kind: 'location',
          assetId: locationId,
          body,
          access: {
            scope: 'project',
            userId: ctx.userId,
            projectId: ctx.projectId,
          },
        })

        const mutationBatch = await createMutationBatch({
          projectId: ctx.projectId,
          userId: ctx.userId,
          source: ctx.source,
          operationId: 'generate_location_image',
          episodeId: null,
          summary: `generate_location_image:${locationId}`,
          entries: [
            {
              kind: 'asset_render_revert',
              targetType: 'ProjectLocation',
              targetId: locationId,
              payload: {
                kind: 'location',
                assetId: locationId,
              },
            },
          ],
        })

        writeOperationDataPart<TaskSubmittedPartData>(ctx.writer, 'data-task-submitted', {
          operationId: 'generate_location_image',
          taskId: result.taskId,
          status: result.status,
          runId: result.runId || null,
          deduped: result.deduped,
          mutationBatchId: mutationBatch.id,
        })

        return {
          ...result,
          locationId,
          mutationBatchId: mutationBatch.id,
        }
      },
    }),

    modify_asset_image: defineOperation({
      id: 'modify_asset_image',
      summary: 'Modify an asset image (character/location) using edit model (async task submission).',
      intent: 'act',
      groupPath: ['asset', 'edit'],
      channels: { tool: false, api: true },
      effects: {
        writes: true,
        billable: true,
        destructive: true,
        overwrite: true,
        bulk: false,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将修改资源图片（可能覆盖现有结果且可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        type: z.enum(['character', 'location']),
        characterId: z.string().min(1).optional(),
        locationId: z.string().min(1).optional(),
      }).passthrough(),
      outputSchema: taskSubmitOutputWithMutationBatch({
        assetId: z.string().min(1),
      }),
      execute: async (ctx, input) => executeAssetImageModificationOperation({
        ctx,
        input: input as Record<string, unknown>,
        operationId: 'modify_asset_image',
        kind: input.type,
      }),
    }),

    modify_character_image: defineOperation({
      id: 'modify_character_image',
      summary: 'Modify a project character image using the edit model.',
      intent: 'act',
      groupPath: ['asset', 'character'],
      effects: {
        writes: true,
        billable: true,
        destructive: true,
        overwrite: true,
        bulk: false,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将修改角色图片（可能覆盖现有结果且可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: modifyCharacterImageInputSchema,
      outputSchema: taskSubmitOutputWithMutationBatch({
        assetId: z.string().min(1),
      }),
      execute: async (ctx, input) => executeAssetImageModificationOperation({
        ctx,
        input: input as Record<string, unknown>,
        operationId: 'modify_character_image',
        kind: 'character',
      }),
    }),

    modify_location_image: defineOperation({
      id: 'modify_location_image',
      summary: 'Modify a project location image using the edit model.',
      intent: 'act',
      groupPath: ['asset', 'location'],
      effects: {
        writes: true,
        billable: true,
        destructive: true,
        overwrite: true,
        bulk: false,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将修改场景图片（可能覆盖现有结果且可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: modifyLocationImageInputSchema,
      outputSchema: taskSubmitOutputWithMutationBatch({
        assetId: z.string().min(1),
      }),
      execute: async (ctx, input) => executeAssetImageModificationOperation({
        ctx,
        input: input as Record<string, unknown>,
        operationId: 'modify_location_image',
        kind: 'location',
      }),
    }),
  }
}
