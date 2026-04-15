import { vi } from 'vitest'
import { TASK_STATUS } from '@/lib/task/types'
import { buildMockRequest } from '../../../helpers/request'

export type RouteContext = {
  params: Promise<{ taskId: string }>
}

export type EmptyRouteContext = {
  params: Promise<Record<string, string>>
}

export type ReplayEvent = Awaited<ReturnType<typeof import('@/lib/task/publisher').listEventsAfter>>[number]
export type TaskLifecycleReplayEvent = Awaited<ReturnType<typeof import('@/lib/task/publisher').listTaskLifecycleEvents>>[number]

export type TaskRecord = {
  id: string
  userId: string
  projectId: string
  type: string
  targetType: string
  targetId: string
  status: string
  errorCode: string | null
  errorMessage: string | null
}

export const authState = {
  authenticated: true,
}

export const queryTasksMock = vi.fn()
export const dismissFailedTasksMock = vi.fn()
export const getTaskByIdMock = vi.fn()
export const cancelTaskMock = vi.fn()
export const removeTaskJobMock = vi.fn(async () => true)
export const publishTaskEventMock = vi.fn(async () => undefined)
export const queryTaskTargetStatesMock = vi.fn()
export const withPrismaRetryMock = vi.fn(async <T>(fn: () => Promise<T>) => await fn())
export const listEventsAfterMock = vi.fn<typeof import('@/lib/task/publisher').listEventsAfter>(async () => [])
export const listTaskLifecycleEventsMock = vi.fn<typeof import('@/lib/task/publisher').listTaskLifecycleEvents>(async () => [])
export const addChannelListenerMock = vi.fn<(channel: string, listener: (message: string) => void) => Promise<() => Promise<void>>>(
  async () => async () => undefined,
)
export const subscriberState = {
  listener: null as ((message: string) => void) | null,
}

export const baseTask: TaskRecord = {
  id: 'task-1',
  userId: 'user-1',
  projectId: 'project-1',
  type: 'IMAGE_CHARACTER',
  targetType: 'CharacterAppearance',
  targetId: 'appearance-1',
  status: TASK_STATUS.FAILED,
  errorCode: null,
  errorMessage: null,
}

export const emptyRouteContext: EmptyRouteContext = { params: Promise.resolve({}) }

export function resetTaskInfraMocks() {
  vi.clearAllMocks()
  authState.authenticated = true
  subscriberState.listener = null

  queryTasksMock.mockResolvedValue([baseTask])
  dismissFailedTasksMock.mockResolvedValue(1)
  getTaskByIdMock.mockResolvedValue(baseTask)
  cancelTaskMock.mockResolvedValue({
    task: {
      ...baseTask,
      status: TASK_STATUS.CANCELED,
      errorCode: 'TASK_CANCELLED',
      errorMessage: 'Task cancelled by user',
    },
    cancelled: true,
  })
  queryTaskTargetStatesMock.mockResolvedValue([
    {
      targetType: 'CharacterAppearance',
      targetId: 'appearance-1',
      active: true,
      status: TASK_STATUS.PROCESSING,
      taskId: 'task-1',
      updatedAt: new Date().toISOString(),
    },
  ])
  addChannelListenerMock.mockImplementation(async (_channel: string, listener: (message: string) => void) => {
    subscriberState.listener = listener
    return async () => undefined
  })
  listTaskLifecycleEventsMock.mockResolvedValue([])
}

export { buildMockRequest }
