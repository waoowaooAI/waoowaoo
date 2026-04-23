import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'
import { toMoneyNumber, type MoneyValue } from '@/lib/billing/money'
import { isArtStyleValue } from '@/lib/constants'
import { resolveDirectorStyleFieldsFromPreset } from '@/lib/director-style'
import { resolveTaskLocale } from '@/lib/task/resolve-locale'
import {
  formatProjectValidationIssue,
  normalizeProjectDraft,
  validateProjectDraft,
  type ProjectDraftInput,
} from '@/lib/projects/validation'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'

function readProjectDraftBody(body: unknown): ProjectDraftInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { name: '' }
  }

  const payload = body as Record<string, unknown>
  return {
    name: typeof payload.name === 'string' ? payload.name : '',
    description: typeof payload.description === 'string' ? payload.description : null,
    directorStylePresetId: typeof payload.directorStylePresetId === 'string' ? payload.directorStylePresetId : null,
  }
}

const EFFECTS_QUERY = {
  writes: false,
  billable: false,
  destructive: false,
  overwrite: false,
  bulk: false,
  externalSideEffects: false,
  longRunning: false,
} as const

const EFFECTS_WRITE = {
  writes: true,
  billable: false,
  destructive: false,
  overwrite: false,
  bulk: false,
  externalSideEffects: false,
  longRunning: false,
} as const

export function createSystemProjectOperations(): ProjectAgentOperationRegistryDraft {
  return {
    list_projects: defineOperation({
      id: 'list_projects',
      summary: 'List user projects with pagination, cost and basic stats.',
      intent: 'query',
      effects: EFFECTS_QUERY,
      inputSchema: z.object({
        page: z.number().int().positive().max(10000).optional(),
        pageSize: z.number().int().positive().max(200).optional(),
        search: z.string().optional(),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const page = input.page ?? 1
        const pageSize = input.pageSize ?? 12
        const search = input.search?.trim() ?? ''

        const where: Record<string, unknown> = { userId: ctx.userId }
        if (search) {
          where.OR = [
            { name: { contains: search } },
            { description: { contains: search } },
          ]
        }

        const [total, allProjects] = await Promise.all([
          prisma.project.count({ where }),
          prisma.project.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
          }),
        ])

        const projects = [...allProjects].sort((a, b) => {
          if (!a.lastAccessedAt && !b.lastAccessedAt) {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          }
          if (!a.lastAccessedAt && b.lastAccessedAt) return -1
          if (a.lastAccessedAt && !b.lastAccessedAt) return 1
          return new Date(b.lastAccessedAt!).getTime() - new Date(a.lastAccessedAt!).getTime()
        })

        const projectIds = projects.map((project) => project.id)
        const [costsByProject, projectEpisodes] = await Promise.all([
          projectIds.length === 0
            ? []
            : prisma.usageCost.groupBy({
                by: ['projectId'],
                where: { projectId: { in: projectIds } },
                _sum: { cost: true },
              }),
          projectIds.length === 0
            ? []
            : prisma.project.findMany({
                where: { id: { in: projectIds } },
                select: {
                  id: true,
                  episodes: {
                    orderBy: { episodeNumber: 'asc' },
                    select: {
                      episodeNumber: true,
                      novelText: true,
                      storyboards: {
                        select: {
                          _count: { select: { panels: true } },
                          panels: {
                            where: {
                              OR: [
                                { imageUrl: { not: null } },
                                { videoUrl: { not: null } },
                              ],
                            },
                            select: {
                              imageUrl: true,
                              videoUrl: true,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              }),
        ])

        const costMap = new Map(
          (costsByProject as Array<{ projectId: string; _sum: { cost: MoneyValue } }>).map((item) => [
            item.projectId,
            toMoneyNumber(item._sum.cost),
          ]),
        )

        const statsMap = new Map<string, {
          episodes: number
          images: number
          videos: number
          panels: number
          firstEpisodePreview: string | null
        }>(
          projectEpisodes.map((projectEntry) => {
            let imageCount = 0
            let videoCount = 0
            let panelCount = 0
            for (const episode of projectEntry.episodes) {
              for (const storyboard of episode.storyboards) {
                panelCount += storyboard._count.panels
                for (const panel of storyboard.panels) {
                  if (panel.imageUrl) imageCount += 1
                  if (panel.videoUrl) videoCount += 1
                }
              }
            }
            const firstEpisode = projectEntry.episodes[0]
            const preview = firstEpisode?.novelText ? firstEpisode.novelText.slice(0, 100) : null
            return [
              projectEntry.id,
              {
                episodes: projectEntry.episodes.length,
                images: imageCount,
                videos: videoCount,
                panels: panelCount,
                firstEpisodePreview: preview,
              },
            ]
          }),
        )

        const projectsWithStats = projects.map((project) => ({
          ...project,
          totalCost: costMap.get(project.id) ?? 0,
          stats: statsMap.get(project.id) ?? {
            episodes: 0,
            images: 0,
            videos: 0,
            panels: 0,
            firstEpisodePreview: null,
          },
        }))

        return {
          projects: projectsWithStats,
          pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize),
          },
        }
      },
    }),

    create_project: defineOperation({
      id: 'create_project',
      summary: 'Create a new project for the current user.',
      intent: 'act',
      effects: EFFECTS_WRITE,
      inputSchema: z.object({
        name: z.string().min(1),
        description: z.string().optional().nullable(),
        directorStylePresetId: z.string().optional().nullable(),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const draft = readProjectDraftBody(input)
        const validationIssue = validateProjectDraft(draft)
        if (validationIssue) {
          const locale = resolveTaskLocale(ctx.request, input) ?? 'zh'
          throw new ApiError('INVALID_PARAMS', {
            code: validationIssue.code,
            field: validationIssue.field,
            ...(typeof validationIssue.limit === 'number' ? { limit: validationIssue.limit } : {}),
            message: formatProjectValidationIssue(validationIssue, locale),
          })
        }

        const normalized = normalizeProjectDraft(draft)
        let directorStyleFields: {
          directorStylePresetId: string | null
          directorStyleDoc: string | null
        }
        try {
          directorStyleFields = resolveDirectorStyleFieldsFromPreset(draft.directorStylePresetId)
        } catch {
          throw new ApiError('INVALID_PARAMS', {
            code: 'INVALID_DIRECTOR_STYLE_PRESET',
            field: 'directorStylePresetId',
            message: 'directorStylePresetId must be a supported value',
          })
        }

        const userPreference = await prisma.userPreference.findUnique({
          where: { userId: ctx.userId },
        })

        if (userPreference?.artStyle && !isArtStyleValue(userPreference.artStyle)) {
          throw new ApiError('EXTERNAL_ERROR', {
            code: 'USER_PREFERENCE_ART_STYLE_INVALID',
            message: 'userPreference.artStyle is invalid',
          })
        }

        const project = await prisma.project.create({
          data: {
            name: normalized.name.trim(),
            description: normalized.description?.trim() || null,
            userId: ctx.userId,
            ...(userPreference && {
              analysisModel: userPreference.analysisModel,
              characterModel: userPreference.characterModel,
              locationModel: userPreference.locationModel,
              storyboardModel: userPreference.storyboardModel,
              editModel: userPreference.editModel,
              videoModel: userPreference.videoModel,
              audioModel: userPreference.audioModel,
              videoRatio: userPreference.videoRatio,
              videoResolution: userPreference.videoResolution,
              artStyle: userPreference.artStyle,
              imageResolution: userPreference.imageResolution,
            }),
            ...directorStyleFields,
          },
        })

        return { project }
      },
    }),
  }
}
