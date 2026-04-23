import { randomUUID } from 'crypto'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getRequestId } from '@/lib/api-errors'
import { submitTask } from '@/lib/task/submitter'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { withTaskUiPayload } from '@/lib/task/ui-payload'
import {
  buildImageBillingPayload,
  getProjectModelConfig,
  resolveProjectModelCapabilityGenerationOptions,
} from '@/lib/config-service'
import { resolveModelSelection } from '@/lib/api-config'
import { hasPanelImageOutput } from '@/lib/task/has-output'
import { createMutationBatch } from '@/lib/mutation-batch/service'
import type { TaskSubmittedPartData } from '@/lib/project-agent/types'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { writeOperationDataPart } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function resolveLocaleFromContext(locale?: unknown): string {
  const normalized = normalizeString(locale)
  return normalized || 'zh'
}

function resolveCandidateCount(input?: unknown): number {
  const parsed = typeof input === 'number' ? input : Number(input)
  if (!Number.isFinite(parsed)) return 1
  return Math.max(1, Math.min(4, Math.trunc(parsed)))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function createPanelVariantId(): string {
  try {
    return randomUUID()
  } catch {
    return `panel-variant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}

async function rollbackCreatedVariantPanel(params: {
  panelId: string
  storyboardId: string
  panelIndex: number
}) {
  await prisma.$transaction(async (tx) => {
    await tx.projectPanel.delete({
      where: { id: params.panelId },
    })

    const maxPanel = await tx.projectPanel.findFirst({
      where: { storyboardId: params.storyboardId },
      orderBy: { panelIndex: 'desc' },
      select: { panelIndex: true },
    })
    const maxPanelIndex = maxPanel?.panelIndex ?? -1
    const offset = maxPanelIndex + 1000

    await tx.projectPanel.updateMany({
      where: {
        storyboardId: params.storyboardId,
        panelIndex: { gt: params.panelIndex },
      },
      data: {
        panelIndex: { increment: offset },
        panelNumber: { increment: offset },
      },
    })

    await tx.projectPanel.updateMany({
      where: {
        storyboardId: params.storyboardId,
        panelIndex: { gt: params.panelIndex + offset },
      },
      data: {
        panelIndex: { decrement: offset + 1 },
        panelNumber: { decrement: offset + 1 },
      },
    })

    const panelCount = await tx.projectPanel.count({
      where: { storyboardId: params.storyboardId },
    })

    await tx.projectStoryboard.update({
      where: { id: params.storyboardId },
      data: { panelCount },
    })
  })
}

export function createStoryboardPanelImageOperations(): ProjectAgentOperationRegistryDraft {
  return {
    regenerate_panel_image: defineOperation({
      id: 'regenerate_panel_image',
      summary: 'Regenerate storyboard panel images (async task submission).',
      intent: 'act',
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
        summary: '将为分镜格子重新生成图片（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        panelId: z.string().min(1).optional(),
        storyboardId: z.string().min(1).optional(),
        panelIndex: z.number().int().min(0).max(1000).optional(),
        count: z.number().int().positive().max(4).optional(),
      }).refine((value) => Boolean(value.panelId || (value.storyboardId && typeof value.panelIndex === 'number')), {
        message: 'panelId or (storyboardId + panelIndex) is required',
        path: ['panelId'],
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const locale = resolveLocaleFromContext(ctx.context.locale)

        let panelId = normalizeString(input.panelId)
        if (!panelId) {
          const storyboardId = normalizeString(input.storyboardId)
          const panelIndex = typeof input.panelIndex === 'number' ? input.panelIndex : NaN
          if (!storyboardId || !Number.isFinite(panelIndex)) {
            throw new Error('PROJECT_AGENT_PANEL_REQUIRED')
          }
          const panel = await prisma.projectPanel.findFirst({
            where: {
              storyboardId,
              panelIndex,
            },
            select: { id: true },
          })
          panelId = panel?.id || ''
        }

        if (!panelId) {
          throw new Error('PROJECT_AGENT_PANEL_NOT_FOUND')
        }

        const candidateCount = resolveCandidateCount(input.count)
        const body = {
          panelId,
          candidateCount,
          count: candidateCount,
          meta: {
            locale,
          },
        }

        const projectModelConfig = await getProjectModelConfig(ctx.projectId, ctx.userId)
        if (!projectModelConfig.storyboardModel) {
          throw new Error('STORYBOARD_MODEL_NOT_CONFIGURED')
        }
        await resolveModelSelection(ctx.userId, projectModelConfig.storyboardModel, 'image')
        const capabilityOptions = await resolveProjectModelCapabilityGenerationOptions({
          projectId: ctx.projectId,
          userId: ctx.userId,
          modelType: 'image',
          modelKey: projectModelConfig.storyboardModel,
        })

        const billingPayload = {
          ...body,
          imageModel: projectModelConfig.storyboardModel,
          ...(Object.keys(capabilityOptions).length > 0 ? { generationOptions: capabilityOptions } : {}),
        }

        const hasOutputAtStart = await hasPanelImageOutput(panelId)

        const result = await submitTask({
          userId: ctx.userId,
          locale: resolveRequiredTaskLocale(ctx.request, body),
          requestId: getRequestId(ctx.request),
          projectId: ctx.projectId,
          type: TASK_TYPE.IMAGE_PANEL,
          targetType: 'ProjectPanel',
          targetId: panelId,
          payload: withTaskUiPayload(billingPayload, {
            intent: 'regenerate',
            hasOutputAtStart,
          }),
          dedupeKey: `image_panel:${panelId}:${candidateCount}`,
          billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.IMAGE_PANEL, billingPayload),
        })

        const mutationBatch = await createMutationBatch({
          projectId: ctx.projectId,
          userId: ctx.userId,
          source: ctx.source,
          operationId: 'regenerate_panel_image',
          summary: `regenerate_panel_image:${panelId}`,
          entries: [
            {
              kind: 'panel_candidate_cancel',
              targetType: 'ProjectPanel',
              targetId: panelId,
            },
          ],
        })

        writeOperationDataPart<TaskSubmittedPartData>(ctx.writer, 'data-task-submitted', {
          operationId: 'regenerate_panel_image',
          taskId: result.taskId,
          status: result.status,
          runId: result.runId || null,
          deduped: result.deduped,
          mutationBatchId: mutationBatch.id,
        })

        return {
          ...result,
          panelId,
          mutationBatchId: mutationBatch.id,
        }
      },
    }),

    panel_variant: defineOperation({
      id: 'panel_variant',
      summary: 'Insert a variant panel after an existing panel and enqueue image generation (async task submission).',
      intent: 'act',
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
        summary: '将创建新的分镜格并生成变体图片（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        storyboardId: z.string().min(1),
        insertAfterPanelId: z.string().min(1),
        sourcePanelId: z.string().min(1),
        variant: z.record(z.unknown()),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const locale = resolveLocaleFromContext(ctx.context.locale)
        const storyboardId = input.storyboardId.trim()
        const insertAfterPanelId = input.insertAfterPanelId.trim()
        const sourcePanelId = input.sourcePanelId.trim()
        const variant = input.variant || {}

        const variantVideoPrompt = typeof variant.video_prompt === 'string' ? variant.video_prompt.trim() : ''
        if (!variantVideoPrompt) {
          throw new Error('PROJECT_AGENT_PANEL_VARIANT_INVALID')
        }

        const storyboard = await prisma.projectStoryboard.findUnique({
          where: { id: storyboardId },
          select: {
            id: true,
            episode: {
              select: {
                projectId: true,
              },
            },
          },
        })
        if (!storyboard || storyboard.episode.projectId !== ctx.projectId) {
          throw new Error('PROJECT_AGENT_STORYBOARD_NOT_FOUND')
        }

        const [sourcePanel, insertAfter] = await Promise.all([
          prisma.projectPanel.findUnique({ where: { id: sourcePanelId } }),
          prisma.projectPanel.findUnique({ where: { id: insertAfterPanelId } }),
        ])
        if (!sourcePanel || sourcePanel.storyboardId !== storyboardId) {
          throw new Error('PROJECT_AGENT_PANEL_NOT_FOUND')
        }
        if (!insertAfter || insertAfter.storyboardId !== storyboardId) {
          throw new Error('PROJECT_AGENT_PANEL_NOT_FOUND')
        }

        const projectModelConfig = await getProjectModelConfig(ctx.projectId, ctx.userId)
        const imageModel = projectModelConfig.storyboardModel
        const createdPanelId = createPanelVariantId()

        let billingPayload: Record<string, unknown>
        try {
          billingPayload = await buildImageBillingPayload({
            projectId: ctx.projectId,
            userId: ctx.userId,
            imageModel,
            basePayload: { ...(isRecord(input) ? input : {}), newPanelId: createdPanelId, meta: { locale } },
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Image model capability not configured'
          throw new Error(message)
        }

        const createdPanel = await prisma.$transaction(async (tx) => {
          const affectedPanels = await tx.projectPanel.findMany({
            where: { storyboardId, panelIndex: { gt: insertAfter.panelIndex } },
            select: { id: true, panelIndex: true },
            orderBy: { panelIndex: 'asc' },
          })

          for (const panel of affectedPanels) {
            await tx.projectPanel.update({
              where: { id: panel.id },
              data: { panelIndex: -(panel.panelIndex + 1) },
            })
          }

          for (const panel of affectedPanels) {
            await tx.projectPanel.update({
              where: { id: panel.id },
              data: { panelIndex: panel.panelIndex + 1 },
            })
          }

          const created = await tx.projectPanel.create({
            data: {
              id: createdPanelId,
              storyboardId,
              panelIndex: insertAfter.panelIndex + 1,
              panelNumber: insertAfter.panelIndex + 2,
              shotType: typeof variant.shot_type === 'string' ? variant.shot_type : sourcePanel.shotType,
              cameraMove: typeof variant.camera_move === 'string' ? variant.camera_move : sourcePanel.cameraMove,
              description: typeof variant.description === 'string' ? variant.description : sourcePanel.description,
              videoPrompt: variantVideoPrompt,
              location: typeof variant.location === 'string' ? variant.location : sourcePanel.location,
              characters: variant.characters ? JSON.stringify(variant.characters) : sourcePanel.characters,
              srtSegment: sourcePanel.srtSegment,
              duration: sourcePanel.duration,
            },
          })

          const panelCount = await tx.projectPanel.count({
            where: { storyboardId },
          })

          await tx.projectStoryboard.update({
            where: { id: storyboardId },
            data: { panelCount },
          })

          return created
        })

        let result: Awaited<ReturnType<typeof submitTask>>
        try {
          result = await submitTask({
            userId: ctx.userId,
            locale: resolveRequiredTaskLocale(ctx.request, billingPayload),
            requestId: getRequestId(ctx.request),
            projectId: ctx.projectId,
            type: TASK_TYPE.PANEL_VARIANT,
            targetType: 'ProjectPanel',
            targetId: createdPanel.id,
            payload: billingPayload,
            dedupeKey: `panel_variant:${storyboardId}:${insertAfterPanelId}:${sourcePanelId}`,
            billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.PANEL_VARIANT, billingPayload),
          })
        } catch (error) {
          await rollbackCreatedVariantPanel({
            panelId: createdPanel.id,
            storyboardId,
            panelIndex: createdPanel.panelIndex,
          })
          throw error
        }

        const mutationBatch = await createMutationBatch({
          projectId: ctx.projectId,
          userId: ctx.userId,
          source: ctx.source,
          operationId: 'panel_variant',
          summary: `panel_variant:${createdPanel.id}`,
          entries: [
            {
              kind: 'panel_variant_delete',
              targetType: 'ProjectPanel',
              targetId: createdPanel.id,
              payload: {
                storyboardId,
                panelIndex: createdPanel.panelIndex,
              },
            },
          ],
        })

        writeOperationDataPart<TaskSubmittedPartData>(ctx.writer, 'data-task-submitted', {
          operationId: 'panel_variant',
          taskId: result.taskId,
          status: result.status,
          runId: result.runId || null,
          deduped: result.deduped,
          mutationBatchId: mutationBatch.id,
        })

        return { ...result, panelId: createdPanel.id, mutationBatchId: mutationBatch.id }
      },
    }),
  }
}
