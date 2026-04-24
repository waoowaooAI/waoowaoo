import { beforeEach, describe, expect, it, vi } from 'vitest'

type ReplayEvent = {
  id: string
  type: string
  mutationBatchId: string
  projectId: string
  userId: string
  ts: string
  operationId: string | null
  episodeId: string | null
  targets: Array<{ targetType: string; targetId: string }>
}

type TaskSnapshotRow = {
  id: string
  type: string
  targetType: string
  targetId: string
  episodeId: string | null
  userId: string
  status: string
  progress: number
  payload: Record<string, unknown> | null
  updatedAt: Date
}

const listEventsAfterMock = vi.hoisted(() => vi.fn<() => Promise<ReplayEvent[]>>(async () => []))
const listMutationBatchReplayEventsMock = vi.hoisted(() => vi.fn<() => Promise<ReplayEvent[]>>(async () => []))
const taskFindManyMock = vi.hoisted(() => vi.fn<() => Promise<TaskSnapshotRow[]>>(async () => []))

vi.mock('@/lib/task/publisher', () => ({
  getProjectChannel: (projectId: string) => `project:${projectId}`,
  listEventsAfter: listEventsAfterMock,
}))

vi.mock('@/lib/mutation-batch/service', () => ({
  listMutationBatchReplayEvents: listMutationBatchReplayEventsMock,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: {
      findMany: taskFindManyMock,
    },
  },
}))

import { createSseOperations } from '@/lib/operations/domains/debug/sse-ops'
import type { ProjectAgentOperationContext } from '@/lib/operations/types'

function buildCtx(): ProjectAgentOperationContext {
  return {
    request: new Request('http://localhost') as ProjectAgentOperationContext['request'],
    userId: 'user-1',
    projectId: 'project-1',
    context: {},
    source: 'project-ui',
    writer: null,
  }
}

describe('sse bootstrap operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    taskFindManyMock.mockResolvedValue([])
  })

  it('replays mutation batches and active task snapshot from a mutation Last-Event-ID cursor', async () => {
    const event = {
      id: 'mb:1777046400000:batch-2',
      type: 'mutation.batch',
      mutationBatchId: 'batch-2',
      projectId: 'project-1',
      userId: 'user-1',
      ts: '2026-04-24T00:00:00.000Z',
      operationId: 'delete_storyboard_panel',
      episodeId: 'episode-1',
      targets: [{ targetType: 'ProjectStoryboard', targetId: 'storyboard-1' }],
    }
    listMutationBatchReplayEventsMock.mockResolvedValueOnce([event])
    taskFindManyMock.mockResolvedValueOnce([{
      id: 'task-1',
      type: 'image_panel',
      targetType: 'ProjectPanel',
      targetId: 'panel-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      status: 'processing',
      progress: 50,
      payload: { ui: { intent: 'generate' } },
      updatedAt: new Date('2026-04-24T00:01:00.000Z'),
    }])

    const ops = createSseOperations()
    const result = await ops.get_sse_bootstrap.execute(buildCtx() as never, {
      episodeId: 'episode-1',
      lastEventId: 'mb:1777046300000:batch-1',
    } as never)

    expect(listMutationBatchReplayEventsMock).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      after: new Date(1777046300000),
      episodeId: 'episode-1',
      limit: 5000,
    })
    expect(listEventsAfterMock).not.toHaveBeenCalled()
    expect(taskFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        projectId: 'project-1',
        userId: 'user-1',
        episodeId: 'episode-1',
      }),
    }))
    expect(result).toEqual({
      channel: 'project:project-1',
      mode: 'mutation_replay_with_active_snapshot',
      fromEventId: 'mb:1777046300000:batch-1',
      events: [
        event,
        expect.objectContaining({
          id: 'snapshot:task-1:1776988860000',
          type: 'task.lifecycle',
          taskId: 'task-1',
          targetType: 'ProjectPanel',
          targetId: 'panel-1',
          episodeId: 'episode-1',
          payload: expect.objectContaining({ lifecycleType: 'task.processing', progress: 50 }),
        }),
      ],
    })
  })
})
