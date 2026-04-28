import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'
import { addSignedUrlsToProject, deleteObjects } from '@/lib/storage'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import { logProjectAction } from '@/lib/logging/semantic'
import { logError } from '@/lib/logging/core'
import {
  collectProjectBailianManagedVoiceIds,
  cleanupUnreferencedBailianVoices,
} from '@/lib/ai-exec/voice-cleanup'
import { resolveTaskLocale } from '@/lib/task/resolve-locale'
import {
  formatProjectValidationIssue,
  normalizeProjectDraft,
  validateProjectDraft,
  type ProjectDraftInput,
} from '@/lib/projects/validation'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'

function readProjectDraftBody(body: unknown): ProjectDraftInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { name: '' }
  }

  const payload = body as Record<string, unknown>
  return {
    name: typeof payload.name === 'string' ? payload.name : '',
    description: typeof payload.description === 'string' ? payload.description : null,
  }
}

async function requireOwnedProject(params: { projectId: string; userId: string }) {
  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    include: { user: true },
  })

  if (!project) {
    throw new ApiError('NOT_FOUND')
  }

  if (project.userId !== params.userId) {
    throw new ApiError('FORBIDDEN')
  }

  return project
}

async function collectProjectStorageKeys(projectId: string): Promise<string[]> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      characters: {
        include: {
          appearances: true,
        },
      },
      locations: {
        include: {
          images: true,
        },
      },
      episodes: {
        include: {
          storyboards: {
            include: {
              panels: true,
            },
          },
        },
      },
    },
  })

  if (!project) {
    throw new ApiError('NOT_FOUND')
  }

  const keys: string[] = []

  for (const character of project.characters) {
    for (const appearance of character.appearances) {
      const key = await resolveStorageKeyFromMediaValue(appearance.imageUrl)
      if (key) keys.push(key)
    }
  }

  for (const location of project.locations) {
    for (const image of location.images) {
      const key = await resolveStorageKeyFromMediaValue(image.imageUrl)
      if (key) keys.push(key)
    }
  }

  for (const episode of project.episodes) {
    const audioKey = await resolveStorageKeyFromMediaValue(episode.audioUrl)
    if (audioKey) keys.push(audioKey)

    for (const storyboard of episode.storyboards) {
      const storyboardKey = await resolveStorageKeyFromMediaValue(storyboard.storyboardImageUrl)
      if (storyboardKey) keys.push(storyboardKey)

      if (storyboard.candidateImages) {
        const raw = storyboard.candidateImages
        const parsed = (() => {
          try {
            return JSON.parse(raw) as unknown
          } catch (error) {
            throw new ApiError('EXTERNAL_ERROR', {
              code: 'PROJECT_CANDIDATE_IMAGES_JSON_INVALID',
              message: error instanceof Error ? error.message : 'candidateImages JSON parse failed',
            })
          }
        })()
        if (Array.isArray(parsed)) {
          for (const value of parsed) {
            const key = await resolveStorageKeyFromMediaValue(value)
            if (key) keys.push(key)
          }
        }
      }

      for (const panel of storyboard.panels) {
        const imageKey = await resolveStorageKeyFromMediaValue(panel.imageUrl)
        if (imageKey) keys.push(imageKey)

        const videoKey = await resolveStorageKeyFromMediaValue(panel.videoUrl)
        if (videoKey) keys.push(videoKey)

        const lipSyncKey = await resolveStorageKeyFromMediaValue((panel as unknown as { lipSyncVideoUrl?: unknown }).lipSyncVideoUrl)
        if (lipSyncKey) keys.push(lipSyncKey)
      }
    }
  }

  const voiceLines = await prisma.projectVoiceLine.findMany({
    where: {
      episode: { projectId },
      audioUrl: { not: null },
    },
    select: { audioUrl: true },
  })
  for (const line of voiceLines) {
    const key = await resolveStorageKeyFromMediaValue(line.audioUrl)
    if (key) keys.push(key)
  }

  return keys
}

export function createProjectCrudOperations(): ProjectAgentOperationRegistryDraft {
  return {
    get_project_basic: {
      id: 'get_project_basic',
      summary: 'Load base project info and update lastAccessedAt.',
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
        const project = await requireOwnedProject({ projectId: ctx.projectId, userId: ctx.userId })

        prisma.project.update({
          where: { id: ctx.projectId },
          data: { lastAccessedAt: new Date() },
        }).catch((error: unknown) => logError('update lastAccessedAt failed', error))

        return { project: addSignedUrlsToProject(project) }
      },
    },

    update_project: {
      id: 'update_project',
      summary: 'Update project name/description for the project owner.',
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
        name: z.string().optional(),
        description: z.string().optional().nullable(),
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

        const existing = await requireOwnedProject({ projectId: ctx.projectId, userId: ctx.userId })
        const normalized = normalizeProjectDraft(draft)

        const updatedProject = await prisma.project.update({
          where: { id: ctx.projectId },
          data: {
            name: normalized.name.trim(),
            description: normalized.description?.trim() || null,
          },
        })

        logProjectAction(
          'UPDATE',
          ctx.userId,
          existing.user?.name,
          ctx.projectId,
          updatedProject.name,
          { changes: { name: updatedProject.name, description: updatedProject.description } },
        )

        return { project: updatedProject }
      },
    },

    delete_project: {
      id: 'delete_project',
      summary: 'Delete the project and cleanup storage objects (destructive).',
      intent: 'act',
      effects: {
        writes: true,
        billable: false,
        destructive: true,
        overwrite: true,
        bulk: true,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将删除整个项目及其关联数据（不可恢复）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
      }).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx) => {
        const project = await requireOwnedProject({ projectId: ctx.projectId, userId: ctx.userId })

        const projectVoiceIds = await collectProjectBailianManagedVoiceIds(ctx.projectId)
        const voiceCleanupResult = await cleanupUnreferencedBailianVoices({
          voiceIds: projectVoiceIds,
          scope: {
            userId: ctx.userId,
            excludeProjectId: ctx.projectId,
          },
        })

        const keys = await collectProjectStorageKeys(ctx.projectId)
        const cosKeys = Array.from(new Set(keys.filter(Boolean)))

        const cosResult = cosKeys.length > 0
          ? await deleteObjects(cosKeys)
          : { success: 0, failed: 0 }

        await prisma.project.delete({
          where: { id: ctx.projectId },
        })

        logProjectAction(
          'DELETE',
          ctx.userId,
          project.user?.name,
          ctx.projectId,
          project.name,
          {
            projectName: project.name,
            cosFilesDeleted: cosResult.success,
            cosFilesFailed: cosResult.failed,
            bailianVoicesDeleted: voiceCleanupResult.deletedVoiceIds.length,
            bailianVoicesSkippedReferenced: voiceCleanupResult.skippedReferencedVoiceIds.length,
          },
        )

        return {
          success: true,
          cosFilesDeleted: cosResult.success,
          cosFilesFailed: cosResult.failed,
          bailianVoicesDeleted: voiceCleanupResult.deletedVoiceIds.length,
          bailianVoicesSkippedReferenced: voiceCleanupResult.skippedReferencedVoiceIds.length,
        }
      },
    },
  }
}
