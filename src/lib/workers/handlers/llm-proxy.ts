import type { Job } from 'bullmq'
import { INTERNAL_TASK_API_BASE_URL, INTERNAL_TASK_TOKEN } from '@/lib/llm-observe/config'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import { type TaskJobData, type TaskType } from '@/lib/task/types'

const LLM_PROXY_ROUTES: Record<string, (job: Job<TaskJobData>) => string> = {}

function getRouteByTaskType(type: TaskType, job: Job<TaskJobData>) {
  const resolver = LLM_PROXY_ROUTES[type]
  if (!resolver) {
    throw new Error(`Unsupported llm proxy task type: ${type}`)
  }
  return resolver(job)
}

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function toAbsoluteUrl(pathname: string) {
  return new URL(pathname, INTERNAL_TASK_API_BASE_URL).toString()
}

function toErrorMessage(status: number, body: unknown) {
  const payload = toObject(body)
  const nestedError = toObject(payload.error)
  const message =
    (typeof payload.message === 'string' && payload.message) ||
    (typeof payload.error === 'string' && payload.error) ||
    (typeof nestedError.message === 'string' && nestedError.message) ||
    (typeof payload.detail === 'string' && payload.detail) ||
    null
  if (message) return message
  return `Internal route failed with status ${status}`
}

export async function handleLLMProxyTask(job: Job<TaskJobData>) {
  const route = getRouteByTaskType(job.data.type, job)
  const payload = {
    ...toObject(job.data.payload),
    sync: 1,
  }

  await reportTaskProgress(job, 15, {
    stage: 'llm_proxy_submit',
    displayMode: 'detail',
    meta: {
      route,
    },
  })

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-internal-user-id': job.data.userId,
    'x-internal-task-stream': '1',
    'x-internal-task-id': job.data.taskId,
    'x-internal-project-id': job.data.projectId,
    'x-internal-task-type': job.data.type,
    'x-internal-target-type': job.data.targetType,
    'x-internal-target-id': job.data.targetId,
  }
  if (job.data.episodeId) {
    headers['x-internal-episode-id'] = job.data.episodeId
  }

  if (INTERNAL_TASK_TOKEN) {
    headers['x-internal-task-token'] = INTERNAL_TASK_TOKEN
  }

  const url = toAbsoluteUrl(route)
  await reportTaskProgress(job, 45, {
    stage: 'llm_proxy_execute',
    displayMode: 'detail',
    meta: {
      route,
    },
  })

  const response = await fetch(url, {
    method: 'POST',
    headers,
    cache: 'no-store',
    body: JSON.stringify(payload),
  })

  const rawText = await response.text()
  let parsed: unknown = null
  if (rawText) {
    try {
      parsed = JSON.parse(rawText)
    } catch {
      parsed = rawText
    }
  }

  if (!response.ok) {
    throw new Error(toErrorMessage(response.status, parsed))
  }

  await assertTaskActive(job, 'llm_proxy_persist')
  await reportTaskProgress(job, 92, {
    stage: 'llm_proxy_persist',
    stageLabel: '保存模型结果',
    displayMode: 'detail',
    message: '模型输出完成，正在保存结果...',
    meta: {
      route,
    },
  })

  return toObject(parsed)
}

export function isLLMProxyTaskType(type: TaskType) {
  return Object.prototype.hasOwnProperty.call(LLM_PROXY_ROUTES, type)
}
