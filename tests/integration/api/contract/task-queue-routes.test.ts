import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_STATUS } from '@/lib/task/types'
import {
  authState,
  baseTask,
  buildMockRequest,
  cancelTaskMock,
  dismissFailedTasksMock,
  emptyRouteContext,
  getTaskByIdMock,
  publishTaskEventMock,
  queryTaskTargetStatesMock,
  queryTasksMock,
  removeTaskJobMock,
  resetTaskInfraMocks,
  withPrismaRetryMock,
  type RouteContext,
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
  queryTasks: queryTasksMock,
  dismissFailedTasks: dismissFailedTasksMock,
  getTaskById: getTaskByIdMock,
  cancelTask: cancelTaskMock,
}))

vi.mock('@/lib/task/queues', () => ({
  removeTaskJob: removeTaskJobMock,
}))

vi.mock('@/lib/task/publisher', () => ({
  publishTaskEvent: publishTaskEventMock,
  getProjectChannel: vi.fn((projectId: string) => `project:${projectId}`),
  listEventsAfter: vi.fn(async () => []),
  listTaskLifecycleEvents: vi.fn(async () => []),
}))

vi.mock('@/lib/task/state-service', () => ({
  queryTaskTargetStates: queryTaskTargetStatesMock,
}))

vi.mock('@/lib/prisma-retry', () => ({
  withPrismaRetry: withPrismaRetryMock,
}))

vi.mock('@/lib/sse/shared-subscriber', () => ({
  getSharedSubscriber: vi.fn(() => ({
    addChannelListener: vi.fn(),
  })),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: {
      findMany: vi.fn(async () => []),
    },
  },
}))

describe('api contract - task queue routes (behavior)', () => {
  beforeEach(() => {
    resetTaskInfraMocks()
  })

  it('GET /api/tasks: unauthenticated -> 401; authenticated -> 200 with caller-owned tasks', async () => {
    const { GET } = await import('@/app/api/tasks/route')

    authState.authenticated = false
    const unauthorizedReq = buildMockRequest({
      path: '/api/tasks',
      method: 'GET',
      query: { projectId: 'project-1', limit: 20 },
    })
    const unauthorizedRes = await GET(unauthorizedReq, emptyRouteContext)
    expect(unauthorizedRes.status).toBe(401)

    authState.authenticated = true
    const req = buildMockRequest({
      path: '/api/tasks',
      method: 'GET',
      query: { projectId: 'project-1', limit: 20, targetId: 'appearance-1' },
    })
    const res = await GET(req, emptyRouteContext)
    expect(res.status).toBe(200)

    const payload = await res.json() as { tasks: TaskRecord[] }
    expect(payload.tasks).toHaveLength(1)
    expect(payload.tasks[0]?.id).toBe('task-1')
    expect(queryTasksMock).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      targetId: 'appearance-1',
      limit: 20,
    }))
  })

  it('POST /api/tasks/dismiss: invalid params -> 400; success -> dismissed count', async () => {
    const { POST } = await import('@/app/api/tasks/dismiss/route')

    const invalidReq = buildMockRequest({
      path: '/api/tasks/dismiss',
      method: 'POST',
      body: { taskIds: [] },
    })
    const invalidRes = await POST(invalidReq, emptyRouteContext)
    expect(invalidRes.status).toBe(400)

    const req = buildMockRequest({
      path: '/api/tasks/dismiss',
      method: 'POST',
      body: { taskIds: ['task-1', 'task-2'] },
    })
    const res = await POST(req, emptyRouteContext)
    expect(res.status).toBe(200)

    const payload = await res.json() as { success: boolean; dismissed: number }
    expect(payload.success).toBe(true)
    expect(payload.dismissed).toBe(1)
    expect(dismissFailedTasksMock).toHaveBeenCalledWith(['task-1', 'task-2'], 'user-1')
  })

  it('POST /api/task-target-states: validates payload and returns queried states', async () => {
    const { POST } = await import('@/app/api/task-target-states/route')

    const invalidReq = buildMockRequest({
      path: '/api/task-target-states',
      method: 'POST',
      body: { projectId: 'project-1' },
    })
    const invalidRes = await POST(invalidReq, emptyRouteContext)
    expect(invalidRes.status).toBe(400)

    const req = buildMockRequest({
      path: '/api/task-target-states',
      method: 'POST',
      body: {
        projectId: 'project-1',
        targets: [
          {
            targetType: 'CharacterAppearance',
            targetId: 'appearance-1',
            types: ['IMAGE_CHARACTER'],
          },
        ],
      },
    })
    const res = await POST(req, emptyRouteContext)
    expect(res.status).toBe(200)

    const payload = await res.json() as { states: Array<Record<string, unknown>> }
    expect(payload.states).toHaveLength(1)
    expect(withPrismaRetryMock).toHaveBeenCalledTimes(1)
    expect(queryTaskTargetStatesMock).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      targets: [
        {
          targetType: 'CharacterAppearance',
          targetId: 'appearance-1',
          types: ['IMAGE_CHARACTER'],
        },
      ],
    })
  })

  it('GET /api/tasks/[taskId]: enforces ownership and returns task detail', async () => {
    const route = await import('@/app/api/tasks/[taskId]/route')

    authState.authenticated = false
    const unauthorizedReq = buildMockRequest({ path: '/api/tasks/task-1', method: 'GET' })
    const unauthorizedRes = await route.GET(unauthorizedReq, { params: Promise.resolve({ taskId: 'task-1' }) })
    expect(unauthorizedRes.status).toBe(401)

    authState.authenticated = true
    getTaskByIdMock.mockResolvedValueOnce({ ...baseTask, userId: 'other-user' })
    const notFoundReq = buildMockRequest({ path: '/api/tasks/task-1', method: 'GET' })
    const notFoundRes = await route.GET(notFoundReq, { params: Promise.resolve({ taskId: 'task-1' }) })
    expect(notFoundRes.status).toBe(404)

    const req = buildMockRequest({ path: '/api/tasks/task-1', method: 'GET' })
    const res = await route.GET(req, { params: Promise.resolve({ taskId: 'task-1' }) })
    expect(res.status).toBe(200)

    const payload = await res.json() as { task: TaskRecord }
    expect(payload.task.id).toBe('task-1')
  })

  it('DELETE /api/tasks/[taskId]: cancellation publishes cancelled event payload', async () => {
    const { DELETE } = await import('@/app/api/tasks/[taskId]/route')

    const req = buildMockRequest({ path: '/api/tasks/task-1', method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ taskId: 'task-1' }) } as RouteContext)
    expect(res.status).toBe(200)
    const payload = await res.json() as { task: TaskRecord; cancelled: boolean }

    expect(removeTaskJobMock).toHaveBeenCalledWith('task-1')
    expect(payload.cancelled).toBe(true)
    expect(payload.task.status).toBe(TASK_STATUS.CANCELED)
    expect(publishTaskEventMock).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-1',
      projectId: 'project-1',
      payload: expect.objectContaining({
        cancelled: true,
        stage: 'cancelled',
      }),
    }))
  })
})
