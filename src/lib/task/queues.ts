import { JobsOptions, Queue } from 'bullmq'
import { queueRedis } from '@/lib/redis'
import { QueueType, TaskType, TASK_TYPE, type TaskJobData } from './types'

export const QUEUE_NAME = {
  IMAGE: 'waoowaoo-image',
  VIDEO: 'waoowaoo-video',
  VOICE: 'waoowaoo-voice',
  TEXT: 'waoowaoo-text',
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

type QueueSingleton = Partial<Record<QueueType, Queue<TaskJobData>>>

const globalForQueues = globalThis as typeof globalThis & {
  __waoowaooQueues?: QueueSingleton
}

const queueSingleton = globalForQueues.__waoowaooQueues || {}
if (!globalForQueues.__waoowaooQueues) {
  globalForQueues.__waoowaooQueues = queueSingleton
}

function getOrCreateQueue(type: QueueType, name: string) {
  const existing = queueSingleton[type]
  if (existing) return existing
  const queue = new Queue<TaskJobData>(name, {
    connection: queueRedis,
    defaultJobOptions,
  })
  queueSingleton[type] = queue
  return queue
}

export function getImageQueue() {
  return getOrCreateQueue('image', QUEUE_NAME.IMAGE)
}

export function getVideoQueue() {
  return getOrCreateQueue('video', QUEUE_NAME.VIDEO)
}

export function getVoiceQueue() {
  return getOrCreateQueue('voice', QUEUE_NAME.VOICE)
}

export function getTextQueue() {
  return getOrCreateQueue('text', QUEUE_NAME.TEXT)
}

export function getAllQueues() {
  return [getImageQueue(), getVideoQueue(), getVoiceQueue(), getTextQueue()]
}

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

const SINGLE_ATTEMPT_TASK_TYPES = new Set<TaskType>([
  TASK_TYPE.STORY_TO_SCRIPT_RUN,
  TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
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
      return getImageQueue()
    case 'video':
      return getVideoQueue()
    case 'voice':
      return getVoiceQueue()
    case 'text':
    default:
      return getTextQueue()
  }
}

export async function addTaskJob(data: TaskJobData, opts?: JobsOptions) {
  const queueType = getQueueTypeByTaskType(data.type)
  const queue = getQueueByType(queueType)
  const priority = typeof opts?.priority === 'number' ? opts.priority : 0
  const attempts = SINGLE_ATTEMPT_TASK_TYPES.has(data.type)
    ? 1
    : (typeof opts?.attempts === 'number' ? opts.attempts : undefined)
  return await queue.add(data.type, data, {
    jobId: data.taskId,
    priority,
    ...(opts || {}),
    ...(attempts !== undefined ? { attempts } : {}),
  })
}

export async function removeTaskJob(taskId: string) {
  for (const queue of getAllQueues()) {
    const job = await queue.getJob(taskId)
    if (!job) continue
    await job.remove()
    return true
  }
  return false
}
