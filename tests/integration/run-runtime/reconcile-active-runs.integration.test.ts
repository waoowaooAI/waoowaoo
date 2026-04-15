import { beforeEach, describe, expect, it } from 'vitest'
import { reconcileActiveRunsFromTasks } from '@/lib/run-runtime/reconcile'
import { RUN_STATUS, RUN_STEP_STATUS } from '@/lib/run-runtime/types'
import { TASK_STATUS, TASK_TYPE } from '@/lib/task/types'
import { prisma } from '../../helpers/prisma'
import { resetBillingState } from '../../helpers/db-reset'
import { createTestUser } from '../../helpers/billing-fixtures'

describe('run runtime reconcileActiveRunsFromTasks', () => {
  beforeEach(async () => {
    await resetBillingState()
  })

  it('marks a running run completed when the linked task already completed', async () => {
    const user = await createTestUser()
    const finishedAt = new Date('2026-03-30T08:00:00.000Z')
    const task = await prisma.task.create({
      data: {
        userId: user.id,
        projectId: 'project-run-complete',
        episodeId: 'episode-run-complete',
        type: TASK_TYPE.STORY_TO_SCRIPT_RUN,
        targetType: 'ProjectEpisode',
        targetId: 'episode-run-complete',
        status: TASK_STATUS.COMPLETED,
        progress: 100,
        payload: { episodeId: 'episode-run-complete' },
        result: {
          episodeId: 'episode-run-complete',
          persistedClips: 12,
        },
        queuedAt: new Date('2026-03-30T07:55:00.000Z'),
        startedAt: new Date('2026-03-30T07:56:00.000Z'),
        finishedAt,
      },
    })
    const run = await prisma.graphRun.create({
      data: {
        userId: user.id,
        projectId: 'project-run-complete',
        episodeId: 'episode-run-complete',
        workflowType: TASK_TYPE.STORY_TO_SCRIPT_RUN,
        taskType: TASK_TYPE.STORY_TO_SCRIPT_RUN,
        taskId: task.id,
        targetType: 'ProjectEpisode',
        targetId: 'episode-run-complete',
        status: RUN_STATUS.RUNNING,
        leaseOwner: 'worker:story-to-script',
        leaseExpiresAt: new Date('2026-03-30T08:05:00.000Z'),
        heartbeatAt: new Date('2026-03-30T07:59:30.000Z'),
        queuedAt: new Date('2026-03-30T07:55:00.000Z'),
        startedAt: new Date('2026-03-30T07:56:00.000Z'),
      },
    })
    await prisma.graphStep.create({
      data: {
        runId: run.id,
        stepKey: 'story_to_script_persist',
        stepTitle: 'Persist screenplay',
        status: RUN_STEP_STATUS.RUNNING,
        currentAttempt: 1,
        stepIndex: 4,
        stepTotal: 4,
        startedAt: new Date('2026-03-30T07:58:00.000Z'),
      },
    })

    const reconciled = await reconcileActiveRunsFromTasks()

    expect(reconciled).toEqual([{
      runId: run.id,
      taskId: task.id,
      nextStatus: 'completed',
      reason: 'linked task already completed',
    }])

    const refreshedRun = await prisma.graphRun.findUnique({ where: { id: run.id } })
    expect(refreshedRun).toMatchObject({
      status: RUN_STATUS.COMPLETED,
      output: {
        episodeId: 'episode-run-complete',
        persistedClips: 12,
      },
      errorCode: null,
      errorMessage: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
    })
    expect(refreshedRun?.finishedAt?.toISOString()).toBe(finishedAt.toISOString())

    const refreshedStep = await prisma.graphStep.findUnique({
      where: {
        runId_stepKey: {
          runId: run.id,
          stepKey: 'story_to_script_persist',
        },
      },
    })
    expect(refreshedStep).toMatchObject({
      status: RUN_STEP_STATUS.COMPLETED,
      lastErrorCode: null,
      lastErrorMessage: null,
    })
    expect(refreshedStep?.finishedAt?.toISOString()).toBe(finishedAt.toISOString())
  })

  it('marks a running run failed when the linked task already failed', async () => {
    const user = await createTestUser()
    const finishedAt = new Date('2026-03-30T09:00:00.000Z')
    const task = await prisma.task.create({
      data: {
        userId: user.id,
        projectId: 'project-run-failed',
        episodeId: 'episode-run-failed',
        type: TASK_TYPE.STORY_TO_SCRIPT_RUN,
        targetType: 'ProjectEpisode',
        targetId: 'episode-run-failed',
        status: TASK_STATUS.FAILED,
        progress: 72,
        payload: { episodeId: 'episode-run-failed' },
        errorCode: 'WATCHDOG_TIMEOUT',
        errorMessage: 'Task heartbeat timeout',
        queuedAt: new Date('2026-03-30T08:50:00.000Z'),
        startedAt: new Date('2026-03-30T08:51:00.000Z'),
        finishedAt,
      },
    })
    const run = await prisma.graphRun.create({
      data: {
        userId: user.id,
        projectId: 'project-run-failed',
        episodeId: 'episode-run-failed',
        workflowType: TASK_TYPE.STORY_TO_SCRIPT_RUN,
        taskType: TASK_TYPE.STORY_TO_SCRIPT_RUN,
        taskId: task.id,
        targetType: 'ProjectEpisode',
        targetId: 'episode-run-failed',
        status: RUN_STATUS.RUNNING,
        leaseOwner: 'worker:story-to-script',
        leaseExpiresAt: new Date('2026-03-30T08:55:00.000Z'),
        heartbeatAt: new Date('2026-03-30T08:54:00.000Z'),
        queuedAt: new Date('2026-03-30T08:50:00.000Z'),
        startedAt: new Date('2026-03-30T08:51:00.000Z'),
      },
    })
    await prisma.graphStep.create({
      data: {
        runId: run.id,
        stepKey: 'screenplay_clip-1',
        stepTitle: 'Screenplay clip 1',
        status: RUN_STEP_STATUS.RUNNING,
        currentAttempt: 1,
        stepIndex: 3,
        stepTotal: 6,
        startedAt: new Date('2026-03-30T08:52:00.000Z'),
      },
    })

    const reconciled = await reconcileActiveRunsFromTasks()

    expect(reconciled).toEqual([{
      runId: run.id,
      taskId: task.id,
      nextStatus: 'failed',
      reason: 'linked task already failed',
    }])

    const refreshedRun = await prisma.graphRun.findUnique({ where: { id: run.id } })
    expect(refreshedRun).toMatchObject({
      status: RUN_STATUS.FAILED,
      errorCode: 'WATCHDOG_TIMEOUT',
      errorMessage: 'Task heartbeat timeout',
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
    })
    expect(refreshedRun?.finishedAt?.toISOString()).toBe(finishedAt.toISOString())

    const refreshedStep = await prisma.graphStep.findUnique({
      where: {
        runId_stepKey: {
          runId: run.id,
          stepKey: 'screenplay_clip-1',
        },
      },
    })
    expect(refreshedStep).toMatchObject({
      status: RUN_STEP_STATUS.FAILED,
      lastErrorCode: 'WATCHDOG_TIMEOUT',
      lastErrorMessage: 'Task heartbeat timeout',
    })
    expect(refreshedStep?.finishedAt?.toISOString()).toBe(finishedAt.toISOString())
  })
})
