import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRun } from '@/lib/run-runtime/service'
import { submitTask } from '@/lib/task/submitter'
import { TASK_STATUS, TASK_TYPE } from '@/lib/task/types'
import { prisma } from '../helpers/prisma'
import { resetBillingState } from '../helpers/db-reset'
import { createTestUser } from '../helpers/billing-fixtures'

const addTaskJobMock = vi.hoisted(() => vi.fn(async () => ({ id: 'mock-job' })))
const publishTaskEventMock = vi.hoisted(() => vi.fn(async () => ({})))

vi.mock('@/lib/task/queues', () => ({
  addTaskJob: addTaskJobMock,
}))

vi.mock('@/lib/task/publisher', () => ({
  publishTaskEvent: publishTaskEventMock,
}))

describe('regression - reusable active run reattach', () => {
  beforeEach(async () => {
    await resetBillingState()
    vi.clearAllMocks()
    process.env.BILLING_MODE = 'OFF'
  })

  it('reattaches a new run-centric task to the existing active run when the linked task is already terminal', async () => {
    const user = await createTestUser()
    const failedTask = await prisma.task.create({
      data: {
        userId: user.id,
        projectId: 'project-regression-run',
        episodeId: 'episode-regression-run',
        type: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
        targetType: 'ProjectEpisode',
        targetId: 'episode-regression-run',
        status: TASK_STATUS.FAILED,
        errorCode: 'TEST_FAILED',
        errorMessage: 'old task already failed',
        payload: {
          episodeId: 'episode-regression-run',
          analysisModel: 'model-core',
          meta: { locale: 'zh' },
        },
        queuedAt: new Date(),
        finishedAt: new Date(),
      },
    })
    const run = await createRun({
      userId: user.id,
      projectId: 'project-regression-run',
      episodeId: 'episode-regression-run',
      workflowType: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
      taskType: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
      taskId: failedTask.id,
      targetType: 'ProjectEpisode',
      targetId: 'episode-regression-run',
      input: {
        episodeId: 'episode-regression-run',
        analysisModel: 'model-core',
        meta: { locale: 'zh' },
      },
    })

    const result = await submitTask({
      userId: user.id,
      locale: 'zh',
      projectId: 'project-regression-run',
      episodeId: 'episode-regression-run',
      type: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
      targetType: 'ProjectEpisode',
      targetId: 'episode-regression-run',
      payload: {
        episodeId: 'episode-regression-run',
        analysisModel: 'model-core',
      },
      dedupeKey: 'script_to_storyboard:episode-regression-run',
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
