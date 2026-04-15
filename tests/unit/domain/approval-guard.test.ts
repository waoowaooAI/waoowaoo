import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  executionPlan: {
    findUnique: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

import { assertApprovedDomainMutationContext } from '@/lib/domain/approvals/guard'

describe('domain approval guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows mutation when no planId is provided', async () => {
    await expect(assertApprovedDomainMutationContext({
      actor: 'workflow',
      workflowId: 'story-to-script',
      runId: 'run-1',
      idempotencyKey: 'run-1:full',
    })).resolves.toBeUndefined()
  })

  it('fails when plan is not executable yet', async () => {
    prismaMock.executionPlan.findUnique.mockResolvedValue({
      id: 'plan-1',
      status: 'awaiting_approval',
      requiresApproval: true,
      linkedRunId: null,
      command: {
        normalizedInput: {
          workflowId: 'story-to-script',
        },
      },
      approvals: [{ status: 'pending' }],
    })

    await expect(assertApprovedDomainMutationContext({
      actor: 'workflow',
      workflowId: 'story-to-script',
      runId: 'run-1',
      planId: 'plan-1',
      idempotencyKey: 'run-1:full',
    })).rejects.toThrow('execution plan is not executable')
  })

  it('fails when workflow id mismatches the approved plan', async () => {
    prismaMock.executionPlan.findUnique.mockResolvedValue({
      id: 'plan-1',
      status: 'approved',
      requiresApproval: true,
      linkedRunId: 'run-1',
      command: {
        normalizedInput: {
          workflowId: 'story-to-script',
        },
      },
      approvals: [{ status: 'approved' }],
    })

    await expect(assertApprovedDomainMutationContext({
      actor: 'workflow',
      workflowId: 'script-to-storyboard',
      runId: 'run-1',
      planId: 'plan-1',
      idempotencyKey: 'run-1:full',
    })).rejects.toThrow('execution plan workflow mismatch')
  })

  it('passes when approved plan and run match mutation context', async () => {
    prismaMock.executionPlan.findUnique.mockResolvedValue({
      id: 'plan-1',
      status: 'running',
      requiresApproval: true,
      linkedRunId: 'run-1',
      command: {
        normalizedInput: {
          workflowId: 'script-to-storyboard',
        },
      },
      approvals: [{ status: 'approved' }],
    })

    await expect(assertApprovedDomainMutationContext({
      actor: 'workflow',
      workflowId: 'script-to-storyboard',
      runId: 'run-1',
      planId: 'plan-1',
      idempotencyKey: 'run-1:full',
    })).resolves.toBeUndefined()
  })
})
