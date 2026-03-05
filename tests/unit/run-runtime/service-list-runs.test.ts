import { beforeEach, describe, expect, it, vi } from 'vitest'

const graphRunFindManyMock = vi.hoisted(() => vi.fn())
const graphRunCreateMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/prisma', () => ({
  prisma: {
    graphRun: {
      findMany: graphRunFindManyMock,
      create: graphRunCreateMock,
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
    graphStep: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    graphStepAttempt: {
      upsert: vi.fn(),
    },
    graphEvent: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    graphCheckpoint: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

import { createRun, listRuns } from '@/lib/run-runtime/service'

describe('run-runtime service listRuns/createRun', () => {
  beforeEach(() => {
    graphRunFindManyMock.mockReset()
    graphRunCreateMock.mockReset()
  })

  it('listRuns 不将 target/episode 过滤直接传给 Prisma，并按 run_context 二次过滤', async () => {
    graphRunFindManyMock.mockResolvedValue([
      {
        id: 'run-1',
        userId: 'user-1',
        projectId: 'project-1',
        workflowType: 'story_to_script_run',
        taskType: null,
        taskId: null,
        status: 'queued',
        input: {
          __run_context: {
            episodeId: 'ep-1',
            targetType: 'NovelPromotionEpisode',
            targetId: 'ep-1',
          },
        },
        output: null,
        errorCode: null,
        createdAt: new Date('2026-03-05T00:00:00.000Z'),
        finishedAt: null,
      },
      {
        id: 'run-2',
        userId: 'user-1',
        projectId: 'project-1',
        workflowType: 'story_to_script_run',
        taskType: null,
        taskId: null,
        status: 'queued',
        input: {
          __run_context: {
            episodeId: 'ep-2',
            targetType: 'NovelPromotionEpisode',
            targetId: 'ep-2',
          },
        },
        output: null,
        errorCode: null,
        createdAt: new Date('2026-03-05T00:01:00.000Z'),
        finishedAt: null,
      },
    ])

    const runs = await listRuns({
      userId: 'user-1',
      projectId: 'project-1',
      workflowType: 'story_to_script_run',
      targetType: 'NovelPromotionEpisode',
      targetId: 'ep-1',
      episodeId: 'ep-1',
      statuses: ['queued'],
      limit: 20,
    })

    expect(graphRunFindManyMock).toHaveBeenCalledTimes(1)
    const firstArg = graphRunFindManyMock.mock.calls[0]?.[0] as {
      where: Record<string, unknown>
    }
    expect(firstArg.where).toMatchObject({
      userId: 'user-1',
      projectId: 'project-1',
      workflowType: 'story_to_script_run',
      status: { in: ['queued'] },
    })
    expect(firstArg.where).not.toHaveProperty('targetType')
    expect(firstArg.where).not.toHaveProperty('targetId')
    expect(firstArg.where).not.toHaveProperty('episodeId')

    expect(runs).toHaveLength(1)
    expect(runs[0]?.id).toBe('run-1')
    expect(runs[0]?.targetId).toBe('ep-1')
    expect(runs[0]?.episodeId).toBe('ep-1')
  })

  it('createRun 将 run context 写入 input.__run_context', async () => {
    graphRunCreateMock.mockResolvedValue({
      id: 'run-created',
      userId: 'user-1',
      projectId: 'project-1',
      workflowType: 'story_to_script_run',
      taskType: 'story_to_script_run',
      taskId: 'task-1',
      status: 'queued',
      input: {
        payload: 'hello',
        __run_context: {
          episodeId: 'ep-1',
          targetType: 'NovelPromotionEpisode',
          targetId: 'ep-1',
        },
      },
      output: null,
      errorCode: null,
      createdAt: new Date('2026-03-05T00:00:00.000Z'),
      finishedAt: null,
    })

    const run = await createRun({
      userId: 'user-1',
      projectId: 'project-1',
      episodeId: 'ep-1',
      workflowType: 'story_to_script_run',
      taskType: 'story_to_script_run',
      taskId: 'task-1',
      targetType: 'NovelPromotionEpisode',
      targetId: 'ep-1',
      input: { payload: 'hello' },
    })

    expect(graphRunCreateMock).toHaveBeenCalledTimes(1)
    expect(graphRunCreateMock.mock.calls[0]?.[0]).toMatchObject({
      data: {
        userId: 'user-1',
        projectId: 'project-1',
        workflowType: 'story_to_script_run',
        status: 'queued',
        input: {
          payload: 'hello',
          __run_context: {
            episodeId: 'ep-1',
            targetType: 'NovelPromotionEpisode',
            targetId: 'ep-1',
          },
        },
      },
    })
    expect(run.episodeId).toBe('ep-1')
    expect(run.targetId).toBe('ep-1')
    expect(run.targetType).toBe('NovelPromotionEpisode')
  })
})
