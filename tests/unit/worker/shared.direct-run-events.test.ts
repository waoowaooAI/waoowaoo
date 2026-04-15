import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Job } from 'bullmq'
import type { TaskJobData } from '@/lib/task/types'

const tryUpdateTaskProgressMock = vi.hoisted(() => vi.fn(async () => true))
const publishTaskEventMock = vi.hoisted(() => vi.fn(async () => ({})))
const publishTaskStreamEventMock = vi.hoisted(() => vi.fn(async () => ({})))
const publishRunEventMock = vi.hoisted(() => vi.fn(async () => undefined))
const mapTaskSSEEventToRunEventsMock = vi.hoisted(() =>
  vi.fn(() => [{
    runId: 'run-1',
    projectId: 'project-1',
    userId: 'user-1',
    eventType: 'step.start',
    stepKey: 'split_clips',
    attempt: 1,
    lane: null,
    payload: { mirrored: true },
  }]),
)

vi.mock('@/lib/prisma', () => ({
  prisma: {
    project: {
      findUnique: vi.fn(async () => null),
    },
  },
}))

vi.mock('@/lib/logging/core', () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('@/lib/task/service', () => ({
  rollbackTaskBillingForTask: vi.fn(async () => ({ attempted: false, rolledBack: false, billingInfo: null })),
  touchTaskHeartbeat: vi.fn(async () => undefined),
  tryMarkTaskCompleted: vi.fn(async () => true),
  tryMarkTaskFailed: vi.fn(async () => true),
  tryMarkTaskProcessing: vi.fn(async () => true),
  tryUpdateTaskProgress: tryUpdateTaskProgressMock,
  updateTaskBillingInfo: vi.fn(async () => undefined),
}))

vi.mock('@/lib/task/publisher', () => ({
  publishTaskEvent: publishTaskEventMock,
  publishTaskStreamEvent: publishTaskStreamEventMock,
}))

vi.mock('@/lib/task/progress-message', () => ({
  buildTaskProgressMessage: vi.fn(() => 'progress-message'),
  getTaskStageLabel: vi.fn((stage: string) => `label:${stage}`),
}))

vi.mock('@/lib/errors/normalize', () => ({
  normalizeAnyError: vi.fn((error: Error) => ({
    code: 'ERROR',
    message: error.message,
    retryable: false,
    provider: null,
  })),
}))

vi.mock('@/lib/billing', () => ({
  rollbackTaskBilling: vi.fn(async () => null),
  settleTaskBilling: vi.fn(async () => null),
}))

vi.mock('@/lib/billing/runtime-usage', () => ({
  withTextUsageCollection: vi.fn(async (fn: () => Promise<unknown>) => ({
    result: await fn(),
    textUsage: null,
  })),
}))

vi.mock('@/lib/logging/file-writer', () => ({
  onProjectNameAvailable: vi.fn(),
}))

vi.mock('@/lib/run-runtime/task-bridge', () => ({
  mapTaskSSEEventToRunEvents: mapTaskSSEEventToRunEventsMock,
}))

vi.mock('@/lib/run-runtime/publisher', () => ({
  publishRunEvent: publishRunEventMock,
}))

import { reportTaskProgress, reportTaskStreamChunk, withTaskLifecycle } from '@/lib/workers/shared'

function buildJob(taskType: TaskJobData['type']): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-1',
      type: taskType,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'ProjectEpisode',
      targetId: 'episode-1',
      userId: 'user-1',
      payload: {
        runId: 'run-1',
      },
      trace: null,
    },
    queueName: 'text',
  } as unknown as Job<TaskJobData>
}

describe('worker shared direct run events', () => {
  beforeEach(() => {
    tryUpdateTaskProgressMock.mockReset()
    tryUpdateTaskProgressMock.mockResolvedValue(true)
    publishTaskEventMock.mockReset()
    publishTaskStreamEventMock.mockReset()
    publishRunEventMock.mockReset()
    mapTaskSSEEventToRunEventsMock.mockClear()
  })

  it('publishes run events directly for core analysis progress updates', async () => {
    await reportTaskProgress(buildJob('story_to_script_run'), 42, {
      stage: 'story_to_script_step',
      stepId: 'split_clips',
      stepTitle: 'Split',
    })

    expect(publishTaskEventMock).toHaveBeenCalledWith(expect.objectContaining({
      taskType: 'story_to_script_run',
      type: 'task.progress',
    }))
    expect(mapTaskSSEEventToRunEventsMock).toHaveBeenCalledTimes(1)
    expect(publishRunEventMock).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run-1',
      eventType: 'step.start',
      stepKey: 'split_clips',
    }))
  })

  it('publishes run events directly for core analysis stream chunks', async () => {
    await reportTaskStreamChunk(buildJob('script_to_storyboard_run'), {
      kind: 'text',
      delta: 'hello',
      seq: 1,
      lane: 'main',
    }, {
      stepId: 'clip_1_phase1',
      stepTitle: 'Phase 1',
    })

    expect(publishTaskStreamEventMock).toHaveBeenCalledWith(expect.objectContaining({
      taskType: 'script_to_storyboard_run',
      persist: true,
    }))
    expect(mapTaskSSEEventToRunEventsMock).toHaveBeenCalledTimes(1)
    expect(publishRunEventMock).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run-1',
      eventType: 'step.start',
      stepKey: 'split_clips',
    }))
  })

  it('emits run.start directly when the core analysis worker begins execution', async () => {
    await withTaskLifecycle(buildJob('story_to_script_run'), async () => ({
      ok: true,
    }))

    expect(publishRunEventMock).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run-1',
      eventType: 'run.start',
    }))
  })
})
