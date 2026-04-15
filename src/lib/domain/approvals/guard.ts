import { prisma } from '@/lib/prisma'
import { DomainValidationError, type DomainMutationContext } from '@/lib/domain/shared'

function readWorkflowIdFromNormalizedInput(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const workflowId = (value as Record<string, unknown>).workflowId
  return typeof workflowId === 'string' && workflowId.trim() ? workflowId.trim() : null
}

export async function assertApprovedDomainMutationContext(input: DomainMutationContext) {
  if (!input.planId?.trim()) return

  const plan = await prisma.executionPlan.findUnique({
    where: { id: input.planId },
    include: {
      command: {
        select: {
          normalizedInput: true,
        },
      },
      approvals: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          status: true,
        },
      },
    },
  })

  if (!plan) {
    throw new DomainValidationError(`execution plan not found: ${input.planId}`)
  }

  const allowedStatuses = new Set(['approved', 'running', 'completed'])
  if (!allowedStatuses.has(plan.status)) {
    throw new DomainValidationError(`execution plan is not executable: ${plan.status}`)
  }

  if (plan.requiresApproval) {
    const latestApproval = plan.approvals[0] || null
    if (!latestApproval || latestApproval.status !== 'approved') {
      throw new DomainValidationError('execution plan approval is missing or not approved')
    }
  }

  if (plan.linkedRunId && input.runId && plan.linkedRunId !== input.runId) {
    throw new DomainValidationError(
      `execution plan run mismatch: expected ${plan.linkedRunId}, received ${input.runId}`,
    )
  }

  const expectedWorkflowId = readWorkflowIdFromNormalizedInput(plan.command.normalizedInput)
  if (expectedWorkflowId && input.workflowId && expectedWorkflowId !== input.workflowId) {
    throw new DomainValidationError(
      `execution plan workflow mismatch: expected ${expectedWorkflowId}, received ${input.workflowId}`,
    )
  }
}

