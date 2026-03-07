import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { calcVoice } from '@/lib/billing/cost'
import { buildDefaultTaskBillingInfo } from '@/lib/billing/task-policy'
import { prepareTaskBilling, rollbackTaskBilling, settleTaskBilling } from '@/lib/billing/service'
import { TASK_TYPE, type TaskBillingInfo } from '@/lib/task/types'
import { prisma } from '../../helpers/prisma'
import { resetBillingState } from '../../helpers/db-reset'
import { createTestProject, createTestUser, seedBalance } from '../../helpers/billing-fixtures'

function expectBillableInfo(info: TaskBillingInfo | null | undefined): Extract<TaskBillingInfo, { billable: true }> {
  expect(info?.billable).toBe(true)
  if (!info || !info.billable) {
    throw new Error('Expected billable task billing info')
  }
  return info
}

describe('billing/service integration', () => {
  beforeEach(async () => {
    await resetBillingState()
  })

  it('marks task billing as skipped in OFF mode', async () => {
    process.env.BILLING_MODE = 'OFF'
    const user = await createTestUser()
    const project = await createTestProject(user.id)
    await seedBalance(user.id, 10)

    const info = buildDefaultTaskBillingInfo(TASK_TYPE.VOICE_LINE, { maxSeconds: 5 })!
    const result = await prepareTaskBilling({
      id: randomUUID(),
      userId: user.id,
      projectId: project.id,
      billingInfo: info,
    })

    expect(result?.billable).toBe(true)
    expect((result as TaskBillingInfo & { status: string }).status).toBe('skipped')
  })

  it('records shadow audit in SHADOW mode and does not consume balance', async () => {
    process.env.BILLING_MODE = 'SHADOW'
    const user = await createTestUser()
    const project = await createTestProject(user.id)
    await seedBalance(user.id, 10)

    const info = buildDefaultTaskBillingInfo(TASK_TYPE.VOICE_LINE, { maxSeconds: 5 })!
    const taskId = randomUUID()
    const prepared = expectBillableInfo(await prepareTaskBilling({
      id: taskId,
      userId: user.id,
      projectId: project.id,
      billingInfo: info,
    }))

    expect(prepared.status).toBe('quoted')

    const settled = expectBillableInfo(await settleTaskBilling({
      id: taskId,
      userId: user.id,
      projectId: project.id,
      billingInfo: prepared,
    }, {
      result: { actualDurationSeconds: 2 },
    }))

    expect(settled.status).toBe('settled')
    expect(settled.chargedCost).toBe(0)

    const balance = await prisma.userBalance.findUnique({ where: { userId: user.id } })
    expect(balance?.balance).toBeCloseTo(10, 8)
    expect(balance?.totalSpent).toBeCloseTo(0, 8)
    expect(await prisma.balanceTransaction.count({ where: { type: 'shadow_consume' } })).toBe(1)
  })

  it('freezes and settles in ENFORCE mode with actual usage', async () => {
    process.env.BILLING_MODE = 'ENFORCE'
    const user = await createTestUser()
    const project = await createTestProject(user.id)
    await seedBalance(user.id, 10)

    const info = buildDefaultTaskBillingInfo(TASK_TYPE.VOICE_LINE, { maxSeconds: 5 })!
    const taskId = randomUUID()
    const prepared = expectBillableInfo(await prepareTaskBilling({
      id: taskId,
      userId: user.id,
      projectId: project.id,
      billingInfo: info,
    }))

    expect(prepared.status).toBe('frozen')
    expect(prepared.freezeId).toBeTruthy()

    const settled = expectBillableInfo(await settleTaskBilling({
      id: taskId,
      userId: user.id,
      projectId: project.id,
      billingInfo: prepared,
    }, {
      result: { actualDurationSeconds: 2 },
    }))

    expect(settled.status).toBe('settled')
    expect(settled.chargedCost).toBeCloseTo(calcVoice(2), 8)

    const balance = await prisma.userBalance.findUnique({ where: { userId: user.id } })
    expect(balance?.totalSpent).toBeCloseTo(calcVoice(2), 8)
    expect(balance?.frozenAmount).toBeCloseTo(0, 8)
  })

  it('rolls back frozen billing in ENFORCE mode', async () => {
    process.env.BILLING_MODE = 'ENFORCE'
    const user = await createTestUser()
    const project = await createTestProject(user.id)
    await seedBalance(user.id, 10)

    const info = buildDefaultTaskBillingInfo(TASK_TYPE.VOICE_LINE, { maxSeconds: 5 })!
    const taskId = randomUUID()
    const prepared = expectBillableInfo(await prepareTaskBilling({
      id: taskId,
      userId: user.id,
      projectId: project.id,
      billingInfo: info,
    }))

    const rolled = expectBillableInfo(await rollbackTaskBilling({
      id: taskId,
      billingInfo: prepared,
    }))

    expect(rolled.status).toBe('rolled_back')
    const balance = await prisma.userBalance.findUnique({ where: { userId: user.id } })
    expect(balance?.balance).toBeCloseTo(10, 8)
    expect(balance?.frozenAmount).toBeCloseTo(0, 8)
  })
})
