import { afterEach, describe, expect, it, vi } from 'vitest'
import { subscribeRecoveredRun } from '@/lib/query/hooks/run-stream/recovered-run-subscription'

type MockEvent = {
  id: string
  type: string
  taskId: string
  projectId: string
  userId: string
  ts: string
  taskType: string
  targetType: string
  targetId: string
  episodeId: string | null
  payload: Record<string, unknown>
}

function buildLifecycleEvent(payload: Record<string, unknown>): MockEvent {
  return {
    id: '1',
    type: 'task.lifecycle',
    taskId: 'task-1',
    projectId: 'project-1',
    userId: 'user-1',
    ts: new Date().toISOString(),
    taskType: 'script_to_storyboard_run',
    targetType: 'episode',
    targetId: 'episode-1',
    episodeId: 'episode-1',
    payload,
  }
}

function buildStreamEvent(payload: Record<string, unknown>): MockEvent {
  return {
    id: 'stream-1',
    type: 'task.stream',
    taskId: 'task-1',
    projectId: 'project-1',
    userId: 'user-1',
    ts: new Date().toISOString(),
    taskType: 'script_to_storyboard_run',
    targetType: 'episode',
    targetId: 'episode-1',
    episodeId: 'episode-1',
    payload,
  }
}

async function waitForCondition(condition: () => boolean, timeoutMs = 1000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('condition not met before timeout')
}

describe('recovered run subscription', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    if (originalFetch) {
      globalThis.fetch = originalFetch
    } else {
      Reflect.deleteProperty(globalThis, 'fetch')
    }
  })

  it('replays task lifecycle events for external mode to recover stage steps', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        events: [
          buildLifecycleEvent({
            lifecycleType: 'task.processing',
            stepId: 'clip_1_phase1',
            stepTitle: '分镜规划',
            stepIndex: 1,
            stepTotal: 4,
            message: 'running',
          }),
        ],
      }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const applyAndCapture = vi.fn()
    const pollTaskTerminalState = vi.fn(async () => null)
    const onSettled = vi.fn()

    const cleanup = subscribeRecoveredRun({
      projectId: 'project-1',
      storageScopeKey: 'episode-1',
      taskId: 'task-1',
      eventSourceMode: 'external',
      taskStreamTimeoutMs: 10_000,
      applyAndCapture,
      pollTaskTerminalState,
      onSettled,
    })

    await waitForCondition(() => fetchMock.mock.calls.length > 0 && applyAndCapture.mock.calls.length > 0)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tasks/task-1?includeEvents=1&eventsLimit=5000',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
      }),
    )
    expect(applyAndCapture).toHaveBeenCalledWith(expect.objectContaining({
      event: 'step.start',
      runId: 'task-1',
      stepId: 'clip_1_phase1',
    }))
    expect(onSettled).not.toHaveBeenCalled()
    cleanup()
  })

  it('settles external recovery when replay hits terminal lifecycle event', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        events: [
          buildLifecycleEvent({
            lifecycleType: 'task.failed',
            message: 'exception TypeError: fetch failed sending request',
          }),
        ],
      }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const applyAndCapture = vi.fn()
    const pollTaskTerminalState = vi.fn(async () => null)
    const onSettled = vi.fn()

    subscribeRecoveredRun({
      projectId: 'project-1',
      storageScopeKey: 'episode-1',
      taskId: 'task-1',
      eventSourceMode: 'external',
      taskStreamTimeoutMs: 10_000,
      applyAndCapture,
      pollTaskTerminalState,
      onSettled,
    })

    await waitForCondition(() => onSettled.mock.calls.length === 1 && applyAndCapture.mock.calls.length > 0)
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(applyAndCapture).toHaveBeenCalledWith(expect.objectContaining({
      event: 'run.error',
      runId: 'task-1',
    }))
  })

  it('replays persisted stream events so refresh keeps prior output', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        events: [
          buildLifecycleEvent({
            lifecycleType: 'task.processing',
            stepId: 'clip_1_phase1',
            stepTitle: '分镜规划',
            stepIndex: 1,
            stepTotal: 1,
            message: 'running',
          }),
          buildStreamEvent({
            stepId: 'clip_1_phase1',
            stream: {
              kind: 'text',
              lane: 'main',
              seq: 1,
              delta: '旧输出',
            },
          }),
        ],
      }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const applyAndCapture = vi.fn()
    const pollTaskTerminalState = vi.fn(async () => null)
    const onSettled = vi.fn()

    const cleanup = subscribeRecoveredRun({
      projectId: 'project-1',
      storageScopeKey: 'episode-1',
      taskId: 'task-1',
      eventSourceMode: 'external',
      taskStreamTimeoutMs: 10_000,
      applyAndCapture,
      pollTaskTerminalState,
      onSettled,
    })

    await waitForCondition(() => applyAndCapture.mock.calls.some((call) => call[0]?.event === 'step.chunk'))
    expect(applyAndCapture).toHaveBeenCalledWith(expect.objectContaining({
      event: 'step.chunk',
      runId: 'task-1',
      stepId: 'clip_1_phase1',
      textDelta: '旧输出',
    }))
    cleanup()
  })
})
