import { beforeEach, describe, expect, it, vi } from 'vitest'

type TaskEventRow = {
  id: number
  taskId: string
  projectId: string
  userId: string
  eventType: string
  payload: Record<string, unknown> | null
  createdAt: Date
}

const taskEventCreateMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<TaskEventRow | null>>(async () => null),
)
const taskEventFindManyMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<TaskEventRow[]>>(async () => []),
)
const taskFindManyMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<Array<Record<string, unknown>>>>(async () => []),
)
const redisPublishMock = vi.hoisted(() => vi.fn(async () => 1))
const mapTaskSSEEventToRunEventsMock = vi.hoisted(() =>
  vi.fn(() => [{
    runId: 'run-1',
    projectId: 'project-1',
    userId: 'user-1',
    eventType: 'step.chunk',
    stepKey: 'split_clips',
    attempt: 1,
    lane: 'text',
    payload: { ok: true },
  }]),
)
const publishRunEventMock = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    taskEvent: {
      create: taskEventCreateMock,
      findMany: taskEventFindManyMock,
    },
    task: {
      findMany: taskFindManyMock,
    },
  },
}))

vi.mock('@/lib/redis', () => ({
  redis: {
    publish: redisPublishMock,
  },
}))

vi.mock('@/lib/run-runtime/task-bridge', () => ({
  mapTaskSSEEventToRunEvents: mapTaskSSEEventToRunEventsMock,
}))

vi.mock('@/lib/run-runtime/publisher', () => ({
  publishRunEvent: publishRunEventMock,
}))

import { publishTaskStreamEvent } from '@/lib/task/publisher'

describe('task publisher direct run event boundary', () => {
  beforeEach(() => {
    taskEventCreateMock.mockReset()
    taskEventFindManyMock.mockReset()
    taskFindManyMock.mockReset()
    redisPublishMock.mockReset()
    mapTaskSSEEventToRunEventsMock.mockClear()
    publishRunEventMock.mockClear()
  })

  it('does not mirror run events for story_to_script task stream events', async () => {
    await publishTaskStreamEvent({
      taskId: 'task-1',
      projectId: 'project-1',
      userId: 'user-1',
      taskType: 'story_to_script_run',
      targetType: 'ProjectEpisode',
      targetId: 'episode-1',
      episodeId: 'episode-1',
      payload: {
        stepId: 'split_clips',
        stream: {
          kind: 'text',
          seq: 1,
          lane: 'main',
          delta: 'hello',
        },
      },
      persist: false,
    })

    expect(redisPublishMock).toHaveBeenCalledTimes(1)
    expect(mapTaskSSEEventToRunEventsMock).not.toHaveBeenCalled()
    expect(publishRunEventMock).not.toHaveBeenCalled()
  })

  it('continues mirroring run events for non-core task types', async () => {
    await publishTaskStreamEvent({
      taskId: 'task-2',
      projectId: 'project-1',
      userId: 'user-1',
      taskType: 'voice_line',
      targetType: 'VoiceLine',
      targetId: 'line-1',
      payload: {
        stepId: 'voice',
        stream: {
          kind: 'text',
          seq: 1,
          lane: 'main',
          delta: 'world',
        },
      },
      persist: false,
    })

    expect(mapTaskSSEEventToRunEventsMock).toHaveBeenCalledTimes(1)
    expect(publishRunEventMock).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run-1',
      eventType: 'step.chunk',
      stepKey: 'split_clips',
    }))
  })
})
