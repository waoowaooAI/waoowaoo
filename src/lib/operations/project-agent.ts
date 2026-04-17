import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { queryTaskTargetStates } from '@/lib/task/state-service'
import { assembleProjectContext } from '@/lib/project-context/assembler'
import { executeProjectCommand, approveProjectPlan, listProjectCommands, rejectProjectPlan } from '@/lib/command-center/executor'
import { listSkillCatalogEntries, listWorkflowPackages } from '@/lib/skill-system/catalog'
import { loadScriptPreview, loadStoryboardPreview } from '@/lib/project-agent/preview'
import { resolveProjectPhase } from '@/lib/project-agent/project-phase'
import { assembleProjectProjectionLite } from '@/lib/project-projection/lite'
import { submitAssetGenerateTask } from '@/lib/assets/services/asset-actions'
import {
  buildAssistantProjectContextSnapshot,
  buildWorkflowApprovalReasons,
  buildWorkflowApprovalSummary,
  buildWorkflowPlanSummary,
} from '@/lib/project-agent/presentation'
import {
  buildRunLifecycleCanonicalEvent,
  buildWorkflowApprovalCanonicalEvent,
  buildWorkflowPlanCanonicalEvent,
} from '@/lib/agent/events/workflow-events'
import type {
  ApprovalRequestPartData,
  ProjectContextPartData,
  ProjectPhasePartData,
  ScriptPreviewPartData,
  StoryboardPreviewPartData,
  TaskSubmittedPartData,
  WorkflowPlanPartData,
  WorkflowStatusPartData,
} from '@/lib/project-agent/types'
import type { ProjectAgentOperationRegistry } from './types'
import { writeOperationDataPart } from './types'

const taskTargetSchema = z.object({
  targetType: z.string().min(1),
  targetId: z.string().min(1),
  types: z.array(z.string().min(1)).optional(),
})

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function resolveLocaleFromContext(locale?: unknown): string {
  const normalized = normalizeString(locale)
  return normalized || 'zh'
}

export function createProjectAgentOperationRegistry(): ProjectAgentOperationRegistry {
  return {
    get_project_phase: {
      description: 'Resolve the current project phase, progress and available next actions.',
      inputSchema: z.object({}),
      execute: async (ctx) => {
        const snapshot = await resolveProjectPhase({
          projectId: ctx.projectId,
          userId: ctx.userId,
          episodeId: ctx.context.episodeId || null,
          currentStage: ctx.context.currentStage || null,
        })
        writeOperationDataPart<ProjectPhasePartData>(ctx.writer, 'data-project-phase', {
          phase: snapshot.phase,
          snapshot,
        })
        return snapshot
      },
    },
    get_project_snapshot: {
      description: 'Load a lightweight project snapshot projection suitable for planning and prompt context.',
      inputSchema: z.object({}),
      execute: async (ctx) => assembleProjectProjectionLite({
        projectId: ctx.projectId,
        userId: ctx.userId,
        episodeId: ctx.context.episodeId || null,
        currentStage: ctx.context.currentStage || null,
      }),
    },
    get_project_context: {
      description: 'Load the current project and episode context snapshot.',
      inputSchema: z.object({}),
      execute: async (ctx) => {
        const projectContext = await assembleProjectContext({
          projectId: ctx.projectId,
          userId: ctx.userId,
          episodeId: ctx.context.episodeId || null,
          currentStage: ctx.context.currentStage || null,
        })
        writeOperationDataPart<ProjectContextPartData>(ctx.writer, 'data-project-context', {
          context: buildAssistantProjectContextSnapshot(projectContext),
        })
        return buildAssistantProjectContextSnapshot(projectContext)
      },
    },
    list_workflow_packages: {
      description: 'List available workflow packages and skill catalog entries.',
      inputSchema: z.object({}),
      execute: async () => ({
        workflows: listWorkflowPackages().map((workflowPackage) => ({
          id: workflowPackage.manifest.id,
          name: workflowPackage.manifest.name,
          summary: workflowPackage.manifest.summary,
          requiresApproval: workflowPackage.manifest.requiresApproval,
          skills: workflowPackage.steps.map((step) => step.skillId),
        })),
        catalog: listSkillCatalogEntries(),
      }),
    },
    create_workflow_plan: {
      description: 'Create a persisted command and plan for a fixed workflow package.',
      inputSchema: z.object({
        workflowId: z.enum(['story-to-script', 'script-to-storyboard']),
        episodeId: z.string().optional(),
        content: z.string().optional(),
      }),
      execute: async (ctx, input) => {
        const result = await executeProjectCommand({
          request: ctx.request,
          projectId: ctx.projectId,
          userId: ctx.userId,
          body: {
            commandType: 'run_workflow_package',
            source: 'assistant-panel',
            workflowId: input.workflowId,
            episodeId: input.episodeId || ctx.context.episodeId || undefined,
            input: {
              ...(input.content ? { content: input.content } : {}),
            },
          },
        })
        const planData: WorkflowPlanPartData = {
          workflowId: input.workflowId,
          commandId: result.commandId,
          planId: result.planId,
          summary: buildWorkflowPlanSummary(input.workflowId),
          requiresApproval: result.requiresApproval,
          event: buildWorkflowPlanCanonicalEvent({
            workflowId: input.workflowId,
            commandId: result.commandId,
            planId: result.planId,
          }),
          steps: result.steps.map((step) => ({
            skillId: step.skillId,
            title: step.title,
          })),
        }
        writeOperationDataPart(ctx.writer, 'data-workflow-plan', planData)
        if (result.requiresApproval) {
          const approvalData: ApprovalRequestPartData = {
            workflowId: input.workflowId,
            commandId: result.commandId,
            planId: result.planId,
            summary: buildWorkflowApprovalSummary(input.workflowId),
            reasons: buildWorkflowApprovalReasons(result.steps),
            event: buildWorkflowApprovalCanonicalEvent({
              workflowId: input.workflowId,
              planId: result.planId,
              status: 'pending',
            }),
          }
          writeOperationDataPart(ctx.writer, 'data-approval-request', approvalData)
        } else {
          const statusData: WorkflowStatusPartData = {
            workflowId: input.workflowId,
            commandId: result.commandId,
            planId: result.planId,
            runId: result.linkedRunId,
            status: result.status,
            activeSkillId: result.steps[0]?.skillId as WorkflowStatusPartData['activeSkillId'],
            event: result.linkedRunId
              ? buildRunLifecycleCanonicalEvent({
                  workflowId: input.workflowId,
                  runId: result.linkedRunId,
                  status: 'start',
                })
              : null,
          }
          writeOperationDataPart(ctx.writer, 'data-workflow-status', statusData)
        }
        return result
      },
    },
    approve_plan: {
      description: 'Approve a pending workflow plan and enqueue execution.',
      inputSchema: z.object({
        planId: z.string().min(1),
        workflowId: z.enum(['story-to-script', 'script-to-storyboard']),
      }),
      execute: async (ctx, input) => {
        const result = await approveProjectPlan({
          request: ctx.request,
          userId: ctx.userId,
          planId: input.planId,
        })
        writeOperationDataPart<WorkflowStatusPartData>(ctx.writer, 'data-workflow-status', {
          workflowId: input.workflowId,
          commandId: result.commandId,
          planId: result.planId,
          runId: result.linkedRunId,
          status: result.status,
          activeSkillId: result.steps[0]?.skillId as WorkflowStatusPartData['activeSkillId'],
          event: result.linkedRunId
            ? buildRunLifecycleCanonicalEvent({
                workflowId: input.workflowId,
                runId: result.linkedRunId,
                status: 'start',
              })
            : null,
        })
        return result
      },
    },
    reject_plan: {
      description: 'Reject a pending workflow plan.',
      inputSchema: z.object({
        planId: z.string().min(1),
        note: z.string().optional(),
      }),
      execute: async (_, input) => rejectProjectPlan({
        planId: input.planId,
        note: input.note,
      }),
    },
    list_recent_commands: {
      description: 'List recent command and run status for the current project or episode.',
      inputSchema: z.object({
        limit: z.number().int().positive().max(20).optional(),
      }),
      execute: async (ctx, input) =>
        listProjectCommands({
          projectId: ctx.projectId,
          episodeId: ctx.context.episodeId || null,
          limit: input.limit || 10,
        }),
    },
    fetch_workflow_preview: {
      description: 'Load a rendered preview for the latest workflow artifacts.',
      inputSchema: z.object({
        workflowId: z.enum(['story-to-script', 'script-to-storyboard']),
        episodeId: z.string().optional(),
      }),
      execute: async (ctx, input) => {
        const resolvedEpisodeId = input.episodeId || ctx.context.episodeId || ''
        if (!resolvedEpisodeId) {
          throw new Error('PROJECT_AGENT_EPISODE_REQUIRED')
        }
        if (input.workflowId === 'story-to-script') {
          const preview = await loadScriptPreview({ episodeId: resolvedEpisodeId })
          writeOperationDataPart<ScriptPreviewPartData>(ctx.writer, 'data-script-preview', preview)
          return preview
        }
        const preview = await loadStoryboardPreview({ episodeId: resolvedEpisodeId })
        writeOperationDataPart<StoryboardPreviewPartData>(ctx.writer, 'data-storyboard-preview', preview)
        return preview
      },
    },
    get_task_status: {
      description: 'Query task target states for one or more project targets.',
      inputSchema: z.object({
        targets: z.array(taskTargetSchema).min(1).max(50),
      }),
      execute: async (ctx, input) => ({
        states: await queryTaskTargetStates({
          projectId: ctx.projectId,
          userId: ctx.userId,
          targets: input.targets,
        }),
      }),
    },
    generate_character_image: {
      description: 'Generate character appearance images for a project character.',
      sideEffects: {
        mode: 'act',
        risk: 'medium',
        billable: true,
        requiresConfirmation: true,
        confirmationSummary: '将为角色生成形象图片（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        characterId: z.string().min(1).optional(),
        characterName: z.string().min(1).optional(),
        appearanceId: z.string().min(1).optional(),
        appearanceIndex: z.number().int().min(0).max(20).optional(),
        count: z.number().int().positive().max(4).optional(),
        imageIndex: z.number().int().min(0).max(20).optional(),
        artStyle: z.string().optional(),
      }).refine((value) => Boolean(value.characterId || value.characterName), {
        message: 'characterId or characterName is required',
        path: ['characterId'],
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

        writeOperationDataPart<TaskSubmittedPartData>(ctx.writer, 'data-task-submitted', {
          operationId: 'generate_character_image',
          taskId: result.taskId,
          status: result.status,
          runId: result.runId || null,
          deduped: result.deduped,
        })

        return {
          ...result,
          characterId,
          appearanceId: appearanceId || null,
        }
      },
    },
    generate_location_image: {
      description: 'Generate location images for a project location.',
      sideEffects: {
        mode: 'act',
        risk: 'medium',
        billable: true,
        requiresConfirmation: true,
        confirmationSummary: '将为场景生成图片（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        locationId: z.string().min(1).optional(),
        locationName: z.string().min(1).optional(),
        count: z.number().int().positive().max(4).optional(),
        imageIndex: z.number().int().min(0).max(50).optional(),
        artStyle: z.string().optional(),
      }).refine((value) => Boolean(value.locationId || value.locationName), {
        message: 'locationId or locationName is required',
        path: ['locationId'],
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

        writeOperationDataPart<TaskSubmittedPartData>(ctx.writer, 'data-task-submitted', {
          operationId: 'generate_location_image',
          taskId: result.taskId,
          status: result.status,
          runId: result.runId || null,
          deduped: result.deduped,
        })

        return {
          ...result,
          locationId,
        }
      },
    },
  }
}
