import { prisma } from '@/lib/prisma'

export const SAVED_SKILL_KIND_WORKFLOW_PLAN_TEMPLATE = 'workflow_plan_template' as const

export type SavedSkillKind = typeof SAVED_SKILL_KIND_WORKFLOW_PLAN_TEMPLATE

export type WorkflowPlanTemplatePayload = {
  kind: typeof SAVED_SKILL_KIND_WORKFLOW_PLAN_TEMPLATE
  workflowId: 'story-to-script' | 'script-to-storyboard'
  episodeId: string | null
  content: string | null
  source: {
    planId: string
    commandId: string
  }
}

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as JsonRecord
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readWorkflowId(value: unknown): WorkflowPlanTemplatePayload['workflowId'] {
  const raw = readString(value)
  if (raw === 'story-to-script' || raw === 'script-to-storyboard') return raw
  throw new Error('SAVED_SKILL_WORKFLOW_ID_INVALID')
}

export async function listSavedSkills(params: {
  userId: string
  projectId?: string | null
  limit?: number
}) {
  return prisma.savedSkill.findMany({
    where: {
      userId: params.userId,
      ...(params.projectId ? { projectId: params.projectId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: params.limit ?? 20,
    select: {
      id: true,
      name: true,
      summary: true,
      kind: true,
      createdAt: true,
      updatedAt: true,
      projectId: true,
    },
  })
}

export async function getSavedSkill(params: {
  userId: string
  savedSkillId: string
}) {
  return prisma.savedSkill.findFirst({
    where: {
      id: params.savedSkillId,
      userId: params.userId,
    },
    select: {
      id: true,
      name: true,
      summary: true,
      kind: true,
      data: true,
      createdAt: true,
      updatedAt: true,
      projectId: true,
    },
  })
}

export async function saveWorkflowPlanTemplateFromExecutionPlan(params: {
  userId: string
  projectId: string
  planId: string
  name: string
  summary?: string | null
}) {
  const plan = await prisma.executionPlan.findFirst({
    where: {
      id: params.planId,
      projectId: params.projectId,
      command: {
        userId: params.userId,
      },
    },
    select: {
      id: true,
      commandId: true,
      command: {
        select: {
          rawInput: true,
        },
      },
    },
  })
  if (!plan) throw new Error('SAVED_SKILL_PLAN_NOT_FOUND')

  const raw = asRecord(plan.command.rawInput)
  const workflowId = readWorkflowId(raw.workflowId)
  const episodeId = readString(raw.episodeId) || null
  const input = asRecord(raw.input)
  const content = readString(input.content) || null

  const payload: WorkflowPlanTemplatePayload = {
    kind: SAVED_SKILL_KIND_WORKFLOW_PLAN_TEMPLATE,
    workflowId,
    episodeId,
    content,
    source: {
      planId: plan.id,
      commandId: plan.commandId,
    },
  }

  const resolvedName = params.name.trim()
  if (!resolvedName) throw new Error('SAVED_SKILL_NAME_REQUIRED')

  return prisma.savedSkill.upsert({
    where: {
      userId_name: {
        userId: params.userId,
        name: resolvedName,
      },
    },
    create: {
      userId: params.userId,
      projectId: params.projectId,
      name: resolvedName,
      summary: params.summary?.trim() || null,
      kind: SAVED_SKILL_KIND_WORKFLOW_PLAN_TEMPLATE,
      data: payload,
    },
    update: {
      projectId: params.projectId,
      summary: params.summary?.trim() || null,
      kind: SAVED_SKILL_KIND_WORKFLOW_PLAN_TEMPLATE,
      data: payload,
    },
    select: {
      id: true,
      name: true,
      summary: true,
      kind: true,
      createdAt: true,
      updatedAt: true,
      projectId: true,
    },
  })
}

