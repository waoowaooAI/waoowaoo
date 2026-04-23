import { z } from 'zod'
import { ApiError } from '@/lib/api-errors'
import { normalizeTaskError } from '@/lib/errors/normalize'
import { removeTaskJob } from '@/lib/task/queues'
import { listTaskLifecycleEvents, publishTaskEvent } from '@/lib/task/publisher'
import { cancelTask, dismissFailedTasks, getTaskById, queryTasks } from '@/lib/task/service'
import { TASK_EVENT_TYPE, type TaskStatus } from '@/lib/task/types'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function withTaskError(task: Awaited<ReturnType<typeof queryTasks>>[number]) {
  const error = normalizeTaskError(task.errorCode, task.errorMessage)
  return {
    ...task,
    error,
  }
}

export function createTaskOperations(): ProjectAgentOperationRegistryDraft {
  return {
    list_tasks: defineOperation({
      id: 'list_tasks',
      summary: 'List tasks for the current user with optional filters.',
      intent: 'query',
      effects: {
        writes: false,
        billable: false,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: false,
        longRunning: false,
      },
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const payload = toObject(input)
        const projectId = readString(payload.projectId) || undefined
        const targetType = readString(payload.targetType) || undefined
        const targetId = readString(payload.targetId) || undefined

        const statusList = Array.isArray(payload.status) ? payload.status : []
        const typeList = Array.isArray(payload.type) ? payload.type : []
        const status = statusList.filter((value): value is TaskStatus => typeof value === 'string') as TaskStatus[]
        const type = typeList.filter((value): value is string => typeof value === 'string')

        const limitRaw = typeof payload.limit === 'string' || typeof payload.limit === 'number'
          ? Number.parseInt(String(payload.limit), 10)
          : 50
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50

        const tasks = await queryTasks({
          projectId,
          targetType,
          targetId,
          status: status.length ? status : undefined,
          type: type.length ? type : undefined,
          limit,
        })

        const filtered = tasks
          .filter((task) => task.userId === ctx.userId)
          .map(withTaskError)
        return { tasks: filtered }
      },
    }),

    dismiss_failed_tasks: defineOperation({
      id: 'dismiss_failed_tasks',
      summary: 'Dismiss failed tasks in bulk for the current user.',
      intent: 'act',
      effects: {
        writes: true,
        billable: false,
        destructive: true,
        overwrite: false,
        bulk: true,
        externalSideEffects: false,
        longRunning: false,
      },
      confirmation: {
        required: true,
        summary: '将批量 dismiss 失败任务（不可逆）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const payload = toObject(input)
        const taskIdsRaw = Array.isArray(payload.taskIds) ? payload.taskIds : null
        const taskIds = taskIdsRaw
          ? taskIdsRaw.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          : []

        if (taskIds.length === 0) {
          throw new ApiError('INVALID_PARAMS')
        }
        if (taskIds.length > 200) {
          throw new ApiError('INVALID_PARAMS')
        }

        const count = await dismissFailedTasks(taskIds, ctx.userId)
        return { success: true, dismissed: count }
      },
    }),

    get_task: defineOperation({
      id: 'get_task',
      summary: 'Get task detail for the current user; optionally includes lifecycle events.',
      intent: 'query',
      effects: {
        writes: false,
        billable: false,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: false,
        longRunning: false,
      },
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const payload = toObject(input)
        const taskId = readString(payload.taskId)
        if (!taskId) {
          throw new ApiError('INVALID_PARAMS')
        }

        const task = await getTaskById(taskId)
        if (!task || task.userId !== ctx.userId) {
          throw new ApiError('NOT_FOUND')
        }

        const includeEvents = payload.includeEvents === true || payload.includeEvents === '1'
        const eventsLimitRaw = typeof payload.eventsLimit === 'string' || typeof payload.eventsLimit === 'number'
          ? Number.parseInt(String(payload.eventsLimit), 10)
          : 500
        const eventsLimit = Number.isFinite(eventsLimitRaw) ? Math.min(Math.max(eventsLimitRaw, 1), 5000) : 500
        const events = includeEvents ? await listTaskLifecycleEvents(taskId, eventsLimit) : null

        return {
          task: {
            ...task,
            error: normalizeTaskError(task.errorCode, task.errorMessage),
          },
          ...(events ? { events } : {}),
        }
      },
    }),

    cancel_task: defineOperation({
      id: 'cancel_task',
      summary: 'Cancel a task owned by the current user and publish cancelled lifecycle payload.',
      intent: 'act',
      effects: {
        writes: true,
        billable: false,
        destructive: true,
        overwrite: true,
        bulk: false,
        externalSideEffects: true,
        longRunning: false,
      },
      confirmation: {
        required: true,
        summary: '将取消该任务。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        taskId: z.string().min(1),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const task = await getTaskById(input.taskId)
        if (!task || task.userId !== ctx.userId) {
          throw new ApiError('NOT_FOUND')
        }

        const { task: updatedTask, cancelled } = await cancelTask(input.taskId)
        if (!updatedTask) {
          throw new ApiError('NOT_FOUND')
        }

        if (cancelled) {
          await removeTaskJob(input.taskId).catch(() => false)
          await publishTaskEvent({
            taskId: updatedTask.id,
            projectId: updatedTask.projectId,
            userId: updatedTask.userId,
            type: TASK_EVENT_TYPE.FAILED,
            taskType: updatedTask.type,
            targetType: updatedTask.targetType,
            targetId: updatedTask.targetId,
            episodeId: updatedTask.episodeId || null,
            payload: {
              ...toObject(updatedTask.payload),
              stage: 'cancelled',
              stageLabel: '任务已取消',
              cancelled: true,
              message: updatedTask.errorMessage || 'Task cancelled by user',
            },
            persist: false,
          })
        }

        return {
          success: true,
          cancelled,
          task: {
            ...updatedTask,
            error: normalizeTaskError(updatedTask.errorCode, updatedTask.errorMessage),
          },
        }
      },
    }),
  }
}
