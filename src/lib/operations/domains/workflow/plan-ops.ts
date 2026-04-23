import { z } from 'zod'
import { executeProjectCommand, approveProjectPlan, rejectProjectPlan } from '@/lib/command-center/executor'
import { resolveWorkflowPackageIdFromCommandInput } from '@/lib/command-center/workflow-id'
import {
  getSavedSkill,
  saveWorkflowPlanTemplateFromExecutionPlan,
  SAVED_SKILL_KIND_WORKFLOW_PLAN_TEMPLATE,
} from '@/lib/saved-skills/service'
import {
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
  WorkflowPlanPartData,
  WorkflowStatusPartData,
} from '@/lib/project-agent/types'
import { ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { writeOperationDataPart } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function createPlanOperations(): ProjectAgentOperationRegistryDraft {
  return {
    save_workflow_plan_as_skill: defineOperation({
      id: 'save_workflow_plan_as_skill',
      summary: 'Save an existing workflow execution plan as a reusable saved skill template.',
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
        planId: z.string().min(1),
        name: z.string().min(1),
        summary: z.string().optional(),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const saved = await saveWorkflowPlanTemplateFromExecutionPlan({
          userId: ctx.userId,
          projectId: ctx.projectId,
          planId: input.planId,
          name: input.name,
          summary: input.summary ?? null,
        })
        return {
          id: saved.id,
          name: saved.name,
          summary: saved.summary,
          kind: saved.kind,
          projectId: saved.projectId,
          createdAt: saved.createdAt.toISOString(),
          updatedAt: saved.updatedAt.toISOString(),
        }
      },
    }),
    create_workflow_plan_from_saved_skill: defineOperation({
      id: 'create_workflow_plan_from_saved_skill',
      summary: 'Create a workflow plan from a saved skill template (workflow_plan_template).',
      intent: 'plan',
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
        savedSkillId: z.string().min(1),
        episodeId: z.string().optional(),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const saved = await getSavedSkill({
          userId: ctx.userId,
          savedSkillId: input.savedSkillId,
        })
        if (!saved) throw new Error('SAVED_SKILL_NOT_FOUND')
        if (saved.projectId && saved.projectId !== ctx.projectId) {
          throw new Error('SAVED_SKILL_PROJECT_MISMATCH')
        }
        if (saved.kind !== SAVED_SKILL_KIND_WORKFLOW_PLAN_TEMPLATE) {
          throw new Error('SAVED_SKILL_KIND_UNSUPPORTED')
        }
        if (!isRecord(saved.data)) {
          throw new Error('SAVED_SKILL_DATA_INVALID')
        }
        const workflowIdRaw = normalizeString(saved.data.workflowId)
        if (workflowIdRaw !== 'story-to-script' && workflowIdRaw !== 'script-to-storyboard') {
          throw new Error('SAVED_SKILL_WORKFLOW_ID_INVALID')
        }
        const content = normalizeString(saved.data.content)
        const episodeId = normalizeString(input.episodeId)
          || normalizeString(saved.data.episodeId)
          || normalizeString(ctx.context.episodeId)
          || undefined

        const result = await executeProjectCommand({
          request: ctx.request,
          projectId: ctx.projectId,
          userId: ctx.userId,
          body: {
            commandType: 'run_workflow_package',
            source: ctx.source,
            workflowId: workflowIdRaw,
            ...(episodeId ? { episodeId } : {}),
            input: {
              ...(content ? { content } : {}),
            },
          },
        })

        const planData: WorkflowPlanPartData = {
          workflowId: workflowIdRaw,
          commandId: result.commandId,
          planId: result.planId,
          summary: buildWorkflowPlanSummary(workflowIdRaw),
          requiresApproval: result.requiresApproval,
          event: buildWorkflowPlanCanonicalEvent({
            workflowId: workflowIdRaw,
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
            workflowId: workflowIdRaw,
            commandId: result.commandId,
            planId: result.planId,
            summary: buildWorkflowApprovalSummary(workflowIdRaw),
            reasons: buildWorkflowApprovalReasons(result.steps),
            event: buildWorkflowApprovalCanonicalEvent({
              workflowId: workflowIdRaw,
              planId: result.planId,
              status: 'pending',
            }),
          }
          writeOperationDataPart(ctx.writer, 'data-approval-request', approvalData)
        } else {
          const statusData: WorkflowStatusPartData = {
            workflowId: workflowIdRaw,
            commandId: result.commandId,
            planId: result.planId,
            runId: result.linkedRunId,
            status: result.status,
            activeSkillId: result.steps[0]?.skillId as WorkflowStatusPartData['activeSkillId'],
            event: result.linkedRunId
              ? buildRunLifecycleCanonicalEvent({
                  workflowId: workflowIdRaw,
                  runId: result.linkedRunId,
                  status: 'start',
                })
              : null,
          }
          writeOperationDataPart(ctx.writer, 'data-workflow-status', statusData)
        }

        return {
          ...result,
          savedSkillId: saved.id,
          savedSkillName: saved.name,
        }
      },
    }),
    create_workflow_plan: defineOperation({
      id: 'create_workflow_plan',
      summary: 'Create a persisted command and plan for a fixed workflow package.',
      intent: 'plan',
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
        workflowId: z.enum(['story-to-script', 'script-to-storyboard']),
        episodeId: z.string().optional(),
        content: z.string().optional(),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const result = await executeProjectCommand({
          request: ctx.request,
          projectId: ctx.projectId,
          userId: ctx.userId,
          body: {
            commandType: 'run_workflow_package',
            source: ctx.source,
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
    }),
    approve_plan: defineOperation({
      id: 'approve_plan',
      summary: 'Approve a pending workflow plan and enqueue execution.',
      intent: 'plan',
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
        summary: '将批准并执行 workflow plan（可能消耗额度/产生计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        planId: z.string().min(1),
        workflowId: z.enum(['story-to-script', 'script-to-storyboard']).optional(),
        confirmed: z.boolean().optional(),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const plan = await prisma.executionPlan.findUnique({
          where: { id: input.planId },
          select: {
            id: true,
            projectId: true,
            command: {
              select: {
                normalizedInput: true,
                rawInput: true,
              },
            },
          },
        })
        if (!plan) {
          throw new ApiError('NOT_FOUND', { message: 'plan not found' })
        }
        if (plan.projectId !== ctx.projectId) {
          throw new ApiError('FORBIDDEN', { message: 'plan project mismatch' })
        }

        const workflowId = input.workflowId
          || resolveWorkflowPackageIdFromCommandInput(plan.command.normalizedInput)
          || resolveWorkflowPackageIdFromCommandInput(plan.command.rawInput)
        if (!workflowId) {
          throw new ApiError('EXTERNAL_ERROR', {
            code: 'WORKFLOW_ID_NOT_FOUND',
            message: 'workflowId is missing in command input',
          })
        }

        const result = await approveProjectPlan({
          request: ctx.request,
          userId: ctx.userId,
          planId: input.planId,
        })
        writeOperationDataPart<WorkflowStatusPartData>(ctx.writer, 'data-workflow-status', {
          workflowId,
          commandId: result.commandId,
          planId: result.planId,
          runId: result.linkedRunId,
          status: result.status,
          activeSkillId: result.steps[0]?.skillId as WorkflowStatusPartData['activeSkillId'],
          event: result.linkedRunId
            ? buildRunLifecycleCanonicalEvent({
                workflowId,
                runId: result.linkedRunId,
                status: 'start',
              })
            : null,
        })
        return result
      },
    }),
    reject_plan: defineOperation({
      id: 'reject_plan',
      summary: 'Reject a pending workflow plan.',
      intent: 'plan',
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
        planId: z.string().min(1),
        note: z.string().optional(),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const plan = await prisma.executionPlan.findUnique({
          where: { id: input.planId },
          select: { id: true, projectId: true },
        })
        if (!plan) {
          throw new ApiError('NOT_FOUND', { message: 'plan not found' })
        }
        if (plan.projectId !== ctx.projectId) {
          throw new ApiError('FORBIDDEN', { message: 'plan project mismatch' })
        }

        return await rejectProjectPlan({
          planId: input.planId,
          note: input.note,
        })
      },
    }),
  }
}
