import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Job } from 'bullmq'
import { UnrecoverableError } from 'bullmq'
import { prepareTaskBilling } from '@/lib/billing/service'
import { buildDefaultTaskBillingInfo } from '@/lib/billing/task-policy'
import { TaskTerminatedError } from '@/lib/task/errors'
import { withTaskLifecycle } from '@/lib/workers/shared'
import { TASK_TYPE, type TaskBillingInfo, type TaskJobData } from '@/lib/task/types'
import { prisma } from '../../helpers/prisma'
import { resetBillingState } from '../../helpers/db-reset'
import { createQueuedTask, createTestProject, createTestUser, seedBalance } from '../../helpers/billing-fixtures'

vi.mock('@/lib/task/publisher', () => ({
  publishTaskEvent: vi.fn(async () => ({})),
}))

async function createPreparedVoiceTask() {
  process.env.BILLING_MODE = 'ENFORCE'
  const user = await createTestUser()
  const project = await createTestProject(user.id)
  await seedBalance(user.id, 10)

  const taskId = randomUUID()
  const raw = buildDefaultTaskBillingInfo(TASK_TYPE.VOICE_LINE, { maxSeconds: 5 })
  if (!raw || !raw.billable) {
    throw new Error('failed to build billing info fixture')
  }
  const prepared = await prepareTaskBilling({
    id: taskId,
    userId: user.id,
    projectId: project.id,
    billingInfo: raw,
  })

  const billingInfo = prepared as TaskBillingInfo
  await createQueuedTask({
    id: taskId,
    userId: user.id,
    projectId: project.id,
    type: TASK_TYPE.VOICE_LINE,
    targetType: 'VoiceLine',
    targetId: 'line-1',
    billingInfo,
  })

  const jobData: TaskJobData = {
    taskId,
    type: TASK_TYPE.VOICE_LINE,
    locale: 'en',
    projectId: project.id,
    targetType: 'VoiceLine',
    targetId: 'line-1',
    billingInfo,
    userId: user.id,
    payload: {},
  }

  const job = {
    data: jobData,
    queueName: 'voice',
    opts: {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 2_000,
      },
    },
    attemptsMade: 0,
  } as unknown as Job<TaskJobData>

  return { taskId, user, project, job }
}

describe('billing/worker lifecycle integration', () => {
  beforeEach(async () => {
    await resetBillingState()
  })

  it('settles billing and marks task completed on success', async () => {
    const fixture = await createPreparedVoiceTask()

    await withTaskLifecycle(fixture.job, async () => ({ actualDurationSeconds: 2 }))

    const task = await prisma.task.findUnique({ where: { id: fixture.taskId } })
    expect(task?.status).toBe('completed')
    const billing = task?.billingInfo as TaskBillingInfo
    expect(billing?.billable).toBe(true)
    expect((billing as Extract<TaskBillingInfo, { billable: true }>).status).toBe('settled')
  })

  it('rolls back billing and marks task failed on error', async () => {
    const fixture = await createPreparedVoiceTask()

    await expect(
      withTaskLifecycle(fixture.job, async () => {
        throw new Error('worker failed')
      }),
    ).rejects.toBeInstanceOf(UnrecoverableError)

    const task = await prisma.task.findUnique({ where: { id: fixture.taskId } })
    expect(task?.status).toBe('failed')
    const billing = task?.billingInfo as TaskBillingInfo
    expect((billing as Extract<TaskBillingInfo, { billable: true }>).status).toBe('rolled_back')
  })

  it('keeps task active for queue retry on retryable worker error', async () => {
    const fixture = await createPreparedVoiceTask()

    await expect(
      withTaskLifecycle(fixture.job, async () => {
        throw new TypeError('terminated')
      }),
    ).rejects.toBeInstanceOf(TypeError)

    const task = await prisma.task.findUnique({ where: { id: fixture.taskId } })
    expect(task?.status).toBe('processing')
    const billing = task?.billingInfo as TaskBillingInfo
    expect((billing as Extract<TaskBillingInfo, { billable: true }>).status).toBe('frozen')
  })

  it('rolls back billing on cancellation path', async () => {
    const fixture = await createPreparedVoiceTask()

    await expect(
      withTaskLifecycle(fixture.job, async () => {
        throw new TaskTerminatedError(fixture.taskId)
      }),
    ).rejects.toBeInstanceOf(UnrecoverableError)

    const task = await prisma.task.findUnique({ where: { id: fixture.taskId } })
    const billing = task?.billingInfo as TaskBillingInfo
    expect((billing as Extract<TaskBillingInfo, { billable: true }>).status).toBe('rolled_back')
    expect(task?.status).not.toBe('failed')
  })
})
