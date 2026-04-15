import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiError } from '@/lib/api-errors'
import { buildDefaultTaskBillingInfo } from '@/lib/billing/task-policy'
import { createRun } from '@/lib/run-runtime/service'
import { submitTask } from '@/lib/task/submitter'
import { TASK_STATUS, TASK_TYPE } from '@/lib/task/types'
import { prisma } from '../../helpers/prisma'
import { resetBillingState } from '../../helpers/db-reset'
import { createTestUser, seedBalance } from '../../helpers/billing-fixtures'

const queueState = vi.hoisted(() => ({
  mode: 'success' as 'success' | 'fail',
  errorMessage: 'queue add failed',
}))
const addTaskJobMock = vi.hoisted(() => vi.fn(async () => ({ id: 'mock-job' })))
const publishTaskEventMock = vi.hoisted(() => vi.fn(async () => ({})))

vi.mock('@/lib/task/queues', () => ({
  addTaskJob: addTaskJobMock,
}))

vi.mock('@/lib/task/publisher', () => ({
  publishTaskEvent: publishTaskEventMock,
}))

addTaskJobMock.mockImplementation(async () => {
    if (queueState.mode === 'fail') {
      throw new Error(queueState.errorMessage)
    }
    return { id: 'mock-job' }
})

describe('billing/submitter integration', () => {
  beforeEach(async () => {
    await resetBillingState()
    process.env.BILLING_MODE = 'ENFORCE'
    queueState.mode = 'success'
    queueState.errorMessage = 'queue add failed'
    vi.clearAllMocks()
  })

  it('builds billing info server-side for billable task submission', async () => {
    const user = await createTestUser()
    await seedBalance(user.id, 10)

    const result = await submitTask({
      userId: user.id,
      locale: 'en',
      projectId: 'project-a',
      type: TASK_TYPE.VOICE_LINE,
      targetType: 'VoiceLine',
      targetId: 'line-a',
      payload: { maxSeconds: 5 },
    })

    expect(result.success).toBe(true)
    const task = await prisma.task.findUnique({ where: { id: result.taskId } })
    expect(task).toBeTruthy()
    const billing = task?.billingInfo as { billable?: boolean; source?: string } | null
    expect(billing?.billable).toBe(true)
    expect(billing?.source).toBe('task')
  })

  it('marks task as failed when balance is insufficient', async () => {
    const user = await createTestUser()
    await seedBalance(user.id, 0)

    const billingInfo = buildDefaultTaskBillingInfo(TASK_TYPE.VOICE_LINE, { maxSeconds: 10 })
    expect(billingInfo?.billable).toBe(true)

    await expect(
      submitTask({
        userId: user.id,
        locale: 'en',
        projectId: 'project-b',
        type: TASK_TYPE.VOICE_LINE,
        targetType: 'VoiceLine',
        targetId: 'line-b',
        payload: { maxSeconds: 10 },
        billingInfo,
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' } satisfies Pick<ApiError, 'code'>)

    const task = await prisma.task.findFirst({
      where: {
        userId: user.id,
        type: TASK_TYPE.VOICE_LINE,
      },
      orderBy: { createdAt: 'desc' },
    })

    expect(task).toBeTruthy()
    expect(task?.status).toBe('failed')
    expect(task?.errorCode).toBe('INSUFFICIENT_BALANCE')
  })

  it('allows billable task submission without computed billingInfo in OFF mode (regression)', async () => {
    process.env.BILLING_MODE = 'OFF'
    const user = await createTestUser()

    const result = await submitTask({
      userId: user.id,
      locale: 'en',
      projectId: 'project-c',
      type: TASK_TYPE.IMAGE_CHARACTER,
      targetType: 'CharacterAppearance',
      targetId: 'appearance-c',
      payload: {},
    })

    expect(result.success).toBe(true)
    const task = await prisma.task.findUnique({ where: { id: result.taskId } })
    expect(task).toBeTruthy()
    expect(task?.errorCode).toBeNull()
    expect(task?.billingInfo).toBeNull()
  })

  it('keeps strict billingInfo validation in ENFORCE mode (regression)', async () => {
    process.env.BILLING_MODE = 'ENFORCE'
    const user = await createTestUser()
    await seedBalance(user.id, 10)

    await expect(
      submitTask({
        userId: user.id,
        locale: 'en',
        projectId: 'project-d',
        type: TASK_TYPE.IMAGE_CHARACTER,
        targetType: 'CharacterAppearance',
        targetId: 'appearance-d',
        payload: {},
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PARAMS' } satisfies Pick<ApiError, 'code'>)

    const task = await prisma.task.findFirst({
      where: {
        userId: user.id,
        type: TASK_TYPE.IMAGE_CHARACTER,
      },
      orderBy: { createdAt: 'desc' },
    })

    expect(task).toBeTruthy()
    expect(task?.status).toBe('failed')
    expect(task?.errorCode).toBe('INVALID_PARAMS')
    expect(task?.errorMessage).toContain('missing server-generated billingInfo')
  })

  it('rolls back billing freeze and marks task failed when queue enqueue fails', async () => {
    const user = await createTestUser()
    await seedBalance(user.id, 10)
    queueState.mode = 'fail'
    queueState.errorMessage = 'queue unavailable'

    await expect(
      submitTask({
        userId: user.id,
        locale: 'en',
        projectId: 'project-e',
        type: TASK_TYPE.VOICE_LINE,
        targetType: 'VoiceLine',
        targetId: 'line-e',
        payload: { maxSeconds: 6 },
      }),
    ).rejects.toMatchObject({ code: 'EXTERNAL_ERROR' } satisfies Pick<ApiError, 'code'>)

    const task = await prisma.task.findFirst({
      where: {
        userId: user.id,
        type: TASK_TYPE.VOICE_LINE,
      },
      orderBy: { createdAt: 'desc' },
    })
    const balance = await prisma.userBalance.findUnique({ where: { userId: user.id } })

    expect(task).toBeTruthy()
    expect(task?.status).toBe('failed')
    expect(task?.errorCode).toBe('ENQUEUE_FAILED')
    expect(task?.errorMessage).toContain('queue unavailable')
    expect(task?.billingInfo).toMatchObject({
      billable: true,
      status: 'rolled_back',
    })
    expect(balance?.balance).toBeCloseTo(10, 8)
    expect(balance?.frozenAmount).toBeCloseTo(0, 8)
    expect(await prisma.balanceFreeze.count()).toBe(1)
    const freeze = await prisma.balanceFreeze.findFirst({ orderBy: { createdAt: 'desc' } })
    expect(freeze?.status).toBe('rolled_back')
  })

  it('reuses the active core analysis run instead of creating a second run', async () => {
    process.env.BILLING_MODE = 'OFF'
    const user = await createTestUser()
    const existingTask = await prisma.task.create({
      data: {
        userId: user.id,
        projectId: 'project-core',
        episodeId: 'episode-core',
        type: TASK_TYPE.STORY_TO_SCRIPT_RUN,
        targetType: 'ProjectEpisode',
        targetId: 'episode-core',
        status: TASK_STATUS.QUEUED,
        payload: {
          episodeId: 'episode-core',
          analysisModel: 'model-core',
          meta: { locale: 'zh' },
        },
        queuedAt: new Date(),
      },
    })
    const run = await createRun({
      userId: user.id,
      projectId: 'project-core',
      episodeId: 'episode-core',
      workflowType: TASK_TYPE.STORY_TO_SCRIPT_RUN,
      taskType: TASK_TYPE.STORY_TO_SCRIPT_RUN,
      taskId: existingTask.id,
      targetType: 'ProjectEpisode',
      targetId: 'episode-core',
      input: {
        episodeId: 'episode-core',
        analysisModel: 'model-core',
        meta: { locale: 'zh' },
      },
    })
    await prisma.task.update({
      where: { id: existingTask.id },
      data: {
        payload: {
          episodeId: 'episode-core',
          analysisModel: 'model-core',
          runId: run.id,
          meta: { locale: 'zh', runId: run.id },
        },
      },
    })

    const result = await submitTask({
      userId: user.id,
      locale: 'zh',
      projectId: 'project-core',
      episodeId: 'episode-core',
      type: TASK_TYPE.STORY_TO_SCRIPT_RUN,
      targetType: 'ProjectEpisode',
      targetId: 'episode-core',
      payload: {
        episodeId: 'episode-core',
        analysisModel: 'model-core',
      },
      dedupeKey: 'story_to_script:episode-core',
    })

    expect(result.deduped).toBe(true)
    expect(result.taskId).toBe(existingTask.id)
    expect(result.runId).toBe(run.id)
    expect(await prisma.graphRun.count()).toBe(1)
    expect(addTaskJobMock).not.toHaveBeenCalled()
  })

  it('reattaches a new task to the existing active run when the old task is already terminal', async () => {
    process.env.BILLING_MODE = 'OFF'
    const user = await createTestUser()
    const failedTask = await prisma.task.create({
      data: {
        userId: user.id,
        projectId: 'project-core-retry',
        episodeId: 'episode-core-retry',
        type: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
        targetType: 'ProjectEpisode',
        targetId: 'episode-core-retry',
        status: TASK_STATUS.FAILED,
        errorCode: 'TEST_FAILED',
        errorMessage: 'old task already failed',
        payload: {
          episodeId: 'episode-core-retry',
          analysisModel: 'model-core',
          meta: { locale: 'zh' },
        },
        queuedAt: new Date(),
        finishedAt: new Date(),
      },
    })
    const run = await createRun({
      userId: user.id,
      projectId: 'project-core-retry',
      episodeId: 'episode-core-retry',
      workflowType: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
      taskType: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
      taskId: failedTask.id,
      targetType: 'ProjectEpisode',
      targetId: 'episode-core-retry',
      input: {
        episodeId: 'episode-core-retry',
        analysisModel: 'model-core',
        meta: { locale: 'zh' },
      },
    })

    const result = await submitTask({
      userId: user.id,
      locale: 'zh',
      projectId: 'project-core-retry',
      episodeId: 'episode-core-retry',
      type: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
      targetType: 'ProjectEpisode',
      targetId: 'episode-core-retry',
      payload: {
        episodeId: 'episode-core-retry',
        analysisModel: 'model-core',
      },
      dedupeKey: 'script_to_storyboard:episode-core-retry',
    })

    expect(result.deduped).toBe(false)
    expect(result.runId).toBe(run.id)
    expect(result.taskId).not.toBe(failedTask.id)

    const refreshedRun = await prisma.graphRun.findUnique({ where: { id: run.id } })
    const newTask = await prisma.task.findUnique({ where: { id: result.taskId } })
    expect(refreshedRun?.taskId).toBe(result.taskId)
    expect(newTask?.status).toBe(TASK_STATUS.QUEUED)
    expect(newTask?.payload).toMatchObject({
      runId: run.id,
    })
  })
})
