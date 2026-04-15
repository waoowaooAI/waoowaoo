import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addChannelListenerMock,
  authState,
  baseTask,
  buildMockRequest,
  emptyRouteContext,
  listEventsAfterMock,
  listTaskLifecycleEventsMock,
  resetTaskInfraMocks,
  subscriberState,
  type ReplayEvent,
  type TaskLifecycleReplayEvent,
  type TaskRecord,
} from '../helpers/task-infra-contract'

vi.mock('@/lib/api-auth', () => {
  const unauthorized = () => new Response(
    JSON.stringify({ error: { code: 'UNAUTHORIZED' } }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  )

  return {
    isErrorResponse: (value: unknown) => value instanceof Response,
    requireUserAuth: async () => {
      if (!authState.authenticated) return unauthorized()
      return { session: { user: { id: 'user-1' } } }
    },
    requireProjectAuthLight: async (projectId: string) => {
      if (!authState.authenticated) return unauthorized()
      return {
        session: { user: { id: 'user-1' } },
        project: { id: projectId, userId: 'user-1' },
      }
    },
  }
})

vi.mock('@/lib/task/service', () => ({
  queryTasks: vi.fn(),
  dismissFailedTasks: vi.fn(),
  getTaskById: vi.fn(async () => baseTask),
  cancelTask: vi.fn(),
}))

vi.mock('@/lib/task/queues', () => ({
  removeTaskJob: vi.fn(),
}))

vi.mock('@/lib/task/publisher', () => ({
  publishTaskEvent: vi.fn(),
  getProjectChannel: vi.fn((projectId: string) => `project:${projectId}`),
  listEventsAfter: listEventsAfterMock,
  listTaskLifecycleEvents: listTaskLifecycleEventsMock,
}))

vi.mock('@/lib/task/state-service', () => ({
  queryTaskTargetStates: vi.fn(),
}))

vi.mock('@/lib/prisma-retry', () => ({
  withPrismaRetry: vi.fn(async <T>(fn: () => Promise<T>) => await fn()),
}))

vi.mock('@/lib/sse/shared-subscriber', () => ({
  getSharedSubscriber: vi.fn(() => ({
    addChannelListener: addChannelListenerMock,
  })),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: {
      findMany: vi.fn(async () => []),
    },
  },
}))

describe('api contract - task run routes (behavior)', () => {
  beforeEach(() => {
    resetTaskInfraMocks()
  })

  it('GET /api/tasks/[taskId]?includeEvents=1: returns lifecycle events for refresh replay', async () => {
    const route = await import('@/app/api/tasks/[taskId]/route')
    const replayEvents: TaskLifecycleReplayEvent[] = [
      {
        id: '11',
        type: 'task.lifecycle',
        taskId: 'task-1',
        projectId: 'project-1',
        userId: 'user-1',
        ts: new Date().toISOString(),
        taskType: 'IMAGE_CHARACTER',
        targetType: 'CharacterAppearance',
        targetId: 'appearance-1',
        episodeId: null,
        payload: {
          lifecycleType: 'task.processing',
          stepId: 'clip_1_phase1',
          stepTitle: '分镜规划',
          stepIndex: 1,
          stepTotal: 3,
          message: 'running',
        },
      },
    ]
    listTaskLifecycleEventsMock.mockResolvedValueOnce(replayEvents)

    const req = buildMockRequest({
      path: '/api/tasks/task-1',
      method: 'GET',
      query: { includeEvents: '1', eventsLimit: '1200' },
    })
    const res = await route.GET(req, { params: Promise.resolve({ taskId: 'task-1' }) })
    expect(res.status).toBe(200)

    const payload = await res.json() as { task: TaskRecord; events: Array<Record<string, unknown>> }
    expect(payload.task.id).toBe('task-1')
    expect(payload.events).toHaveLength(1)
    expect(payload.events[0]?.id).toBe('11')
    expect(listTaskLifecycleEventsMock).toHaveBeenCalledWith('task-1', 1200)
  })

  it('GET /api/sse: missing projectId -> 400; unauthenticated with projectId -> 401', async () => {
    const { GET } = await import('@/app/api/sse/route')

    const invalidReq = buildMockRequest({ path: '/api/sse', method: 'GET' })
    const invalidRes = await GET(invalidReq, emptyRouteContext)
    expect(invalidRes.status).toBe(400)

    authState.authenticated = false
    const unauthorizedReq = buildMockRequest({
      path: '/api/sse',
      method: 'GET',
      query: { projectId: 'project-1' },
    })
    const unauthorizedRes = await GET(unauthorizedReq, emptyRouteContext)
    expect(unauthorizedRes.status).toBe(401)
  })

  it('GET /api/sse: authenticated replay request returns SSE stream and replays missed events', async () => {
    const { GET } = await import('@/app/api/sse/route')

    listEventsAfterMock.mockResolvedValueOnce([
      {
        id: '4',
        type: 'task.lifecycle',
        taskId: 'task-1',
        projectId: 'project-1',
        userId: 'user-1',
        ts: new Date().toISOString(),
        taskType: 'IMAGE_CHARACTER',
        targetType: 'CharacterAppearance',
        targetId: 'appearance-1',
        episodeId: null,
        payload: { lifecycleType: 'task.created' },
      } satisfies ReplayEvent,
    ])

    const req = buildMockRequest({
      path: '/api/sse',
      method: 'GET',
      query: { projectId: 'project-1' },
      headers: { 'last-event-id': '3' },
    })
    const res = await GET(req, emptyRouteContext)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(listEventsAfterMock).toHaveBeenCalledWith('project-1', 3, 5000)
    expect(addChannelListenerMock).toHaveBeenCalledWith('project:project-1', expect.any(Function))

    const reader = res.body?.getReader()
    expect(reader).toBeTruthy()
    const firstChunk = await reader!.read()
    expect(firstChunk.done).toBe(false)
    const decoded = new TextDecoder().decode(firstChunk.value)
    expect(decoded).toContain('event:')
    await reader!.cancel()
  })

  it('GET /api/sse: channel lifecycle stream includes terminal completed event', async () => {
    const { GET } = await import('@/app/api/sse/route')
    listEventsAfterMock.mockResolvedValueOnce([])

    const req = buildMockRequest({
      path: '/api/sse',
      method: 'GET',
      query: { projectId: 'project-1' },
      headers: { 'last-event-id': '10' },
    })
    const res = await GET(req, emptyRouteContext)
    expect(res.status).toBe(200)

    const listener = subscriberState.listener
    expect(listener).toBeTruthy()

    listener!(JSON.stringify({
      id: '11',
      type: 'task.lifecycle',
      taskId: 'task-1',
      projectId: 'project-1',
      userId: 'user-1',
      ts: new Date().toISOString(),
      taskType: 'IMAGE_CHARACTER',
      targetType: 'CharacterAppearance',
      targetId: 'appearance-1',
      episodeId: null,
      payload: { lifecycleType: 'processing', progress: 60 },
    }))
    listener!(JSON.stringify({
      id: '12',
      type: 'task.lifecycle',
      taskId: 'task-1',
      projectId: 'project-1',
      userId: 'user-1',
      ts: new Date().toISOString(),
      taskType: 'IMAGE_CHARACTER',
      targetType: 'CharacterAppearance',
      targetId: 'appearance-1',
      episodeId: null,
      payload: { lifecycleType: 'completed', progress: 100 },
    }))

    const reader = res.body?.getReader()
    expect(reader).toBeTruthy()
    const chunk1 = await reader!.read()
    const chunk2 = await reader!.read()
    const merged = `${new TextDecoder().decode(chunk1.value)}${new TextDecoder().decode(chunk2.value)}`

    expect(merged).toContain('"lifecycleType":"processing"')
    expect(merged).toContain('"lifecycleType":"completed"')
    await reader!.cancel()
  })
})
