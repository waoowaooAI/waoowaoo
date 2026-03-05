import { createScopedLogger } from '@/lib/logging/core'
import { prisma } from '@/lib/prisma'
import { addTaskJob } from '@/lib/task/queues'
import { normalizeTaskPayloadLocale, resolveRecoverableTaskLocale } from '@/lib/task/recover-locale'
import { TASK_TYPE, TASK_STATUS, type TaskType } from '@/lib/task/types'

const WATCHDOG_INTERVAL_MS = Number.parseInt(process.env.TASK_WATCHDOG_INTERVAL_MS || '15000', 10) || 15000
const HEARTBEAT_TIMEOUT_MS = Number.parseInt(process.env.TASK_HEARTBEAT_TIMEOUT_MS || '90000', 10) || 90000
const RECONCILE_BATCH_SIZE = Number.parseInt(process.env.TASK_RECONCILE_BATCH_SIZE || '100', 10) || 100

const TASK_TYPE_SET: ReadonlySet<string> = new Set(Object.values(TASK_TYPE))

let watchdogTimer: ReturnType<typeof setInterval> | null = null

const logger = createScopedLogger({
  module: 'task.reconcile',
  action: 'task.reconcile.tick',
})

function toTaskType(value: string): TaskType | null {
  if (!TASK_TYPE_SET.has(value)) return null
  return value as TaskType
}

function toPayload(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

async function failTask(taskId: string, errorCode: string, errorMessage: string) {
  await prisma.task.update({
    where: { id: taskId },
    data: {
      status: TASK_STATUS.FAILED,
      errorCode,
      errorMessage,
      finishedAt: new Date(),
    },
  })
}

async function enqueueQueuedTasks() {
  const rows = await prisma.task.findMany({
    where: {
      status: TASK_STATUS.QUEUED,
      startedAt: null,
    },
    orderBy: { queuedAt: 'asc' },
    take: RECONCILE_BATCH_SIZE,
    select: {
      id: true,
      type: true,
      userId: true,
      projectId: true,
      episodeId: true,
      targetType: true,
      targetId: true,
      payload: true,
      billingInfo: true,
    },
  })

  let enqueued = 0
  let failed = 0

  for (const task of rows) {
    const taskType = toTaskType(task.type)
    if (!taskType) {
      await failTask(task.id, 'INVALID_TASK_TYPE', `invalid task type: ${task.type}`)
      failed++
      continue
    }
    if (!task.projectId || !task.targetType || !task.targetId) {
      await failTask(task.id, 'INVALID_PARAMS', 'task project_id / target_type / target_id is required')
      failed++
      continue
    }

    try {
      const locale = await resolveRecoverableTaskLocale({
        taskId: task.id,
        payload: task.payload,
      })

      if (!locale) {
        await failTask(task.id, 'TASK_LOCALE_REQUIRED', 'task locale is missing')
        failed++
        continue
      }

      const normalizedPayload = normalizeTaskPayloadLocale(task.payload, locale)

      await addTaskJob({
        taskId: task.id,
        type: taskType,
        locale,
        projectId: task.projectId,
        episodeId: task.episodeId,
        targetType: task.targetType,
        targetId: task.targetId,
        payload: toPayload(normalizedPayload),
        userId: task.userId,
        billingInfo: (task.billingInfo as unknown as import('@/lib/task/types').TaskBillingInfo | null) || null,
        trace: null,
      })

      enqueued++
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await failTask(task.id, 'EXTERNAL_ERROR', message.slice(0, 500))
      failed++
    }
  }

  if (rows.length > 0) {
    logger.info({
      action: 'task.reconcile.enqueue_queued',
      message: 'reconciled queued tasks',
      details: {
        scanned: rows.length,
        enqueued,
        failed,
      },
    })
  }
}

async function requeueStalledProcessingTasks() {
  const timeoutAt = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS)

  const rows = await prisma.task.findMany({
    where: {
      status: TASK_STATUS.PROCESSING,
      heartbeatAt: { lt: timeoutAt },
    },
    take: RECONCILE_BATCH_SIZE,
    select: {
      id: true,
      attempt: true,
      maxAttempts: true,
    },
  })

  for (const row of rows) {
    if (row.attempt >= row.maxAttempts) {
      await failTask(row.id, 'WATCHDOG_TIMEOUT', 'task heartbeat timeout')
      continue
    }

    await prisma.task.update({
      where: { id: row.id },
      data: {
        status: TASK_STATUS.QUEUED,
        attempt: { increment: 1 },
        startedAt: null,
        heartbeatAt: null,
        queuedAt: new Date(),
      },
    })
  }

  if (rows.length > 0) {
    logger.warn({
      action: 'task.reconcile.requeue_processing',
      message: 're-queued stalled processing tasks',
      details: {
        count: rows.length,
      },
    })
  }
}

export async function reconcileTaskStateOnce() {
  await enqueueQueuedTasks()
  await requeueStalledProcessingTasks()
}

export async function isJobAlive(taskId: string): Promise<boolean> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { status: true },
  })
  if (!task) return false
  return task.status === TASK_STATUS.QUEUED || task.status === TASK_STATUS.PROCESSING
}

export function stopTaskWatchdog() {
  if (watchdogTimer) {
    clearInterval(watchdogTimer)
    watchdogTimer = null
    logger.info({
      action: 'task.reconcile.stop',
      message: 'task watchdog stopped',
    })
  }
}

export function startTaskWatchdog() {
  if (watchdogTimer) {
    return
  }

  watchdogTimer = setInterval(() => {
    void reconcileTaskStateOnce().catch((error) => {
      logger.error({
        action: 'task.reconcile.failed',
        message: error instanceof Error ? error.message : String(error),
      })
    })
  }, WATCHDOG_INTERVAL_MS)

  logger.info({
    action: 'task.reconcile.start',
    message: 'task watchdog started',
    details: {
      intervalMs: WATCHDOG_INTERVAL_MS,
      heartbeatTimeoutMs: HEARTBEAT_TIMEOUT_MS,
      batchSize: RECONCILE_BATCH_SIZE,
    },
  })
}
