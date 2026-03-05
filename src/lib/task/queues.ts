import { JobsOptions, Queue } from 'bullmq'
import { createScopedLogger } from '@/lib/logging/core'
import { QueueType, TaskType, TASK_TYPE, type TaskJobData } from './types'

export const QUEUE_NAME = {
  IMAGE: 'ivibemovie-image',
  VIDEO: 'ivibemovie-video',
  VOICE: 'ivibemovie-voice',
  TEXT: 'ivibemovie-text',
} as const

const defaultJobOptions: JobsOptions = {
  removeOnComplete: 500,
  removeOnFail: 500,
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 2_000,
  },
}

const logger = createScopedLogger({
  module: 'task.queues',
  action: 'task.queue',
})

export const imageQueue = new Queue<TaskJobData>(QUEUE_NAME.IMAGE, {
  defaultJobOptions,
})

export const videoQueue = new Queue<TaskJobData>(QUEUE_NAME.VIDEO, {
  defaultJobOptions,
})

export const voiceQueue = new Queue<TaskJobData>(QUEUE_NAME.VOICE, {
  defaultJobOptions,
})

export const textQueue = new Queue<TaskJobData>(QUEUE_NAME.TEXT, {
  defaultJobOptions,
})

const ALL_QUEUES: Array<{ queueType: QueueType; queueName: string; queue: Queue<TaskJobData> }> = [
  {
    queueType: 'image',
    queueName: QUEUE_NAME.IMAGE,
    queue: imageQueue,
  },
  {
    queueType: 'video',
    queueName: QUEUE_NAME.VIDEO,
    queue: videoQueue,
  },
  {
    queueType: 'voice',
    queueName: QUEUE_NAME.VOICE,
    queue: voiceQueue,
  },
  {
    queueType: 'text',
    queueName: QUEUE_NAME.TEXT,
    queue: textQueue,
  },
]

const IMAGE_TYPES = new Set<TaskType>([
  TASK_TYPE.IMAGE_PANEL,
  TASK_TYPE.IMAGE_CHARACTER,
  TASK_TYPE.IMAGE_LOCATION,
  TASK_TYPE.PANEL_VARIANT,
  TASK_TYPE.MODIFY_ASSET_IMAGE,
  TASK_TYPE.REGENERATE_GROUP,
  TASK_TYPE.ASSET_HUB_IMAGE,
  TASK_TYPE.ASSET_HUB_MODIFY,
])

const VIDEO_TYPES = new Set<TaskType>([TASK_TYPE.VIDEO_PANEL, TASK_TYPE.LIP_SYNC])
const VOICE_TYPES = new Set<TaskType>([
  TASK_TYPE.VOICE_LINE,
  TASK_TYPE.VOICE_DESIGN,
  TASK_TYPE.ASSET_HUB_VOICE_DESIGN,
])

export function getQueueTypeByTaskType(type: TaskType): QueueType {
  if (IMAGE_TYPES.has(type)) return 'image'
  if (VIDEO_TYPES.has(type)) return 'video'
  if (VOICE_TYPES.has(type)) return 'voice'
  return 'text'
}

export function getQueueByType(type: QueueType) {
  switch (type) {
    case 'image':
      return imageQueue
    case 'video':
      return videoQueue
    case 'voice':
      return voiceQueue
    case 'text':
    default:
      return textQueue
  }
}

export async function addTaskJob(data: TaskJobData, opts?: JobsOptions) {
  const queueType = getQueueTypeByTaskType(data.type)
  const queue = getQueueByType(queueType)
  const priority = typeof opts?.priority === 'number' ? opts.priority : 0
  const startedAt = Date.now()
  const enqueueOpts = {
    jobId: data.taskId,
    priority,
    ...(opts || {}),
  }

  logger.info({
    action: 'task.queue.enqueue.begin',
    message: 'enqueue task to queue',
    taskId: data.taskId,
    projectId: data.projectId,
    userId: data.userId,
    details: {
      queueType,
      queueName: QUEUE_NAME[queueType.toUpperCase() as 'IMAGE' | 'VIDEO' | 'VOICE' | 'TEXT'],
      taskType: data.type,
      priority,
      attempts: enqueueOpts.attempts ?? defaultJobOptions.attempts ?? null,
      backoff: enqueueOpts.backoff ?? defaultJobOptions.backoff ?? null,
    },
  })

  try {
    const job = await queue.add(data.type, data, enqueueOpts)
    logger.info({
      action: 'task.queue.enqueue.success',
      message: 'task enqueued',
      taskId: data.taskId,
      projectId: data.projectId,
      userId: data.userId,
      durationMs: Date.now() - startedAt,
      details: {
        queueType,
        queueName: QUEUE_NAME[queueType.toUpperCase() as 'IMAGE' | 'VIDEO' | 'VOICE' | 'TEXT'],
        taskType: data.type,
        jobId: job.id,
        priority,
      },
    })
    return job
  } catch (error) {
    logger.error({
      action: 'task.queue.enqueue.failed',
      message: error instanceof Error ? error.message : String(error),
      taskId: data.taskId,
      projectId: data.projectId,
      userId: data.userId,
      durationMs: Date.now() - startedAt,
      errorCode: 'QUEUE_ENQUEUE_FAILED',
      retryable: false,
      details: {
        queueType,
        queueName: QUEUE_NAME[queueType.toUpperCase() as 'IMAGE' | 'VIDEO' | 'VOICE' | 'TEXT'],
        taskType: data.type,
        priority,
      },
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : {
              message: String(error),
            },
    })
    throw error
  }
}

export async function removeTaskJob(taskId: string) {
  const startedAt = Date.now()
  logger.info({
    action: 'task.queue.remove.begin',
    message: 'remove task job requested',
    taskId,
  })

  for (const queueInfo of ALL_QUEUES) {
    const job = await queueInfo.queue.getJob(taskId)
    if (!job) continue
    await job.remove()
    logger.info({
      action: 'task.queue.remove.success',
      message: 'task job removed from queue',
      taskId,
      durationMs: Date.now() - startedAt,
      details: {
        queueType: queueInfo.queueType,
        queueName: queueInfo.queueName,
        jobId: job.id,
      },
    })
    return true
  }
  logger.warn({
    action: 'task.queue.remove.miss',
    message: 'task job not found in any queue',
    taskId,
    durationMs: Date.now() - startedAt,
  })
  return false
}
