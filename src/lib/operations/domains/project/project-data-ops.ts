import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'
import { copyAssetFromGlobal } from '@/lib/assets/services/asset-actions'
import { getProjectCostDetails } from '@/lib/billing'
import { BILLING_CURRENCY } from '@/lib/billing/currency'
import { attachMediaFieldsToProject } from '@/lib/media/attach'
import { buildProjectReadModel } from '@/lib/projects/build-project-read-model'
import { logError } from '@/lib/logging/core'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'

function readAssetKind(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'location'
  const record = value as Record<string, unknown>
  return typeof record.assetKind === 'string' ? record.assetKind : 'location'
}

export function createProjectDataOperations(): ProjectAgentOperationRegistryDraft {
  return {
    get_project_assets: defineOperation({
      id: 'get_project_assets',
      summary: 'Load project assets (characters, locations, props) with stable media URLs.',
      intent: 'query',
      effects: {
        writes: false,
        billable: false,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: false,
        longRunning: false,
      },
      inputSchema: z.object({}),
      outputSchema: z.unknown(),
      execute: async (ctx) => {
        const projectWithAssets = await prisma.project.findUnique({
          where: { id: ctx.projectId },
          include: {
            characters: {
              include: {
                appearances: {
                  orderBy: { appearanceIndex: 'asc' },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
            locations: {
              include: {
                images: {
                  orderBy: { imageIndex: 'asc' },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        })

        if (!projectWithAssets) {
          throw new ApiError('NOT_FOUND')
        }

        const withSignedUrls = await attachMediaFieldsToProject(projectWithAssets)
        const locations = (withSignedUrls.locations || []).filter((item) => readAssetKind(item) !== 'prop')
        const props = (withSignedUrls.locations || []).filter((item) => readAssetKind(item) === 'prop')

        return {
          characters: withSignedUrls.characters || [],
          locations,
          props,
        }
      },
    }),

    copy_asset_from_global: defineOperation({
      id: 'copy_asset_from_global',
      summary: 'Copy a global asset into the current project asset record.',
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
        type: z.enum(['character', 'location', 'voice']),
        targetId: z.string().min(1),
        globalAssetId: z.string().min(1),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) =>
        copyAssetFromGlobal({
          kind: input.type,
          targetId: input.targetId,
          globalAssetId: input.globalAssetId,
          access: {
            userId: ctx.userId,
            projectId: ctx.projectId,
          },
        }),
    }),

    update_storyboard_photography_plan: defineOperation({
      id: 'update_storyboard_photography_plan',
      summary: 'Update a storyboard photography plan JSON payload.',
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
        storyboardId: z.string().min(1),
        photographyPlan: z.unknown().optional().nullable(),
      }),
      outputSchema: z.object({
        success: z.literal(true),
      }),
      execute: async (ctx, input) => {
        const storyboard = await prisma.projectStoryboard.findUnique({
          where: { id: input.storyboardId },
          select: { id: true, episodeId: true },
        })

        if (!storyboard) {
          throw new ApiError('NOT_FOUND')
        }

        const episode = await prisma.projectEpisode.findUnique({
          where: { id: storyboard.episodeId },
          select: { projectId: true },
        })

        if (!episode || episode.projectId !== ctx.projectId) {
          throw new ApiError('NOT_FOUND')
        }

        const photographyPlanJson = input.photographyPlan === undefined || input.photographyPlan === null
          ? null
          : JSON.stringify(input.photographyPlan)

        await prisma.projectStoryboard.update({
          where: { id: input.storyboardId },
          data: { photographyPlan: photographyPlanJson },
        })

        return { success: true }
      },
    }),

    get_project_costs: defineOperation({
      id: 'get_project_costs',
      summary: 'Load project cost breakdown for the project owner.',
      intent: 'query',
      effects: {
        writes: false,
        billable: false,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: false,
        longRunning: false,
      },
      inputSchema: z.object({}),
      outputSchema: z.unknown(),
      execute: async (ctx) => {
        const project = await prisma.project.findUnique({
          where: { id: ctx.projectId },
          select: { userId: true, name: true },
        })

        if (!project) {
          throw new ApiError('NOT_FOUND')
        }

        if (project.userId !== ctx.userId) {
          throw new ApiError('FORBIDDEN')
        }

        const costDetails = await getProjectCostDetails(ctx.projectId)

        return {
          projectId: ctx.projectId,
          projectName: project.name,
          currency: BILLING_CURRENCY,
          ...costDetails,
        }
      },
    }),

    get_project_data: defineOperation({
      id: 'get_project_data',
      summary: 'Load unified project data payload for the project owner (includes workflow and assets).',
      intent: 'query',
      effects: {
        writes: true,
        billable: false,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: false,
        longRunning: false,
      },
      inputSchema: z.object({}),
      outputSchema: z.unknown(),
      execute: async (ctx) => {
        const project = await prisma.project.findUnique({
          where: { id: ctx.projectId },
          include: { user: true },
        })

        if (!project) {
          throw new ApiError('NOT_FOUND')
        }

        if (project.userId !== ctx.userId) {
          throw new ApiError('FORBIDDEN')
        }

        prisma.project.update({
          where: { id: ctx.projectId },
          data: { lastAccessedAt: new Date() },
        }).catch((error: unknown) => logError('update lastAccessedAt failed', error))

        const projectWithWorkflow = await prisma.project.findUnique({
          where: { id: ctx.projectId },
          include: {
            episodes: {
              orderBy: { episodeNumber: 'asc' },
            },
            characters: {
              include: {
                appearances: true,
              },
              orderBy: { createdAt: 'asc' },
            },
            locations: {
              include: {
                images: true,
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        })

        if (!projectWithWorkflow) {
          throw new ApiError('NOT_FOUND')
        }

        const projectWithSignedUrls = await attachMediaFieldsToProject(projectWithWorkflow)
        const fullProject = buildProjectReadModel(projectWithWorkflow, projectWithSignedUrls)

        return { project: fullProject }
      },
    }),
  }
}
