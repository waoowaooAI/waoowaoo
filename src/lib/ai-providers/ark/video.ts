import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { createVideoGenerator } from '@/lib/ai-providers/adapters/media/generators/factory'
import type { AiProviderVideoExecutionContext } from '@/lib/ai-providers/runtime-types'
import { fetchWithTimeoutAndRetry } from './image'

const ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'

export interface ArkVideoTaskRequest {
  model: string
  content: Array<{
    type: 'image_url' | 'video_url' | 'audio_url' | 'text' | 'draft_task'
    image_url?: { url: string }
    video_url?: { url: string }
    audio_url?: { url: string }
    text?: string
    role?: 'first_frame' | 'last_frame' | 'reference_image' | 'reference_video' | 'reference_audio'
    draft_task?: { id: string }
  }>
  resolution?: '480p' | '720p' | '1080p'
  ratio?: string
  duration?: number
  frames?: number
  seed?: number
  camera_fixed?: boolean
  watermark?: boolean
  return_last_frame?: boolean
  service_tier?: 'default' | 'flex'
  execution_expires_after?: number
  generate_audio?: boolean
  draft?: boolean
  tools?: Array<{ type: 'web_search' }>
}

export interface ArkVideoTaskResponse {
  id: string
  model: string
  status: 'processing' | 'queued' | 'running' | 'succeeded' | 'failed'
  content?:
    | {
        video_url?: string
        image_url?: string
        audio_url?: string
      }
    | Array<{
        type?: 'video_url' | 'image_url' | 'audio_url'
        video_url?: { url?: string }
        image_url?: { url?: string }
        audio_url?: { url?: string }
      }>
  usage?: {
    completion_tokens?: number
    total_tokens?: number
    tool_usage?: { web_search?: number }
  }
  error?: { code: string; message: string }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function validateArkVideoTaskRequest(request: ArkVideoTaskRequest) {
  const allowedTopLevelKeys = new Set([
    'model',
    'content',
    'resolution',
    'ratio',
    'duration',
    'frames',
    'seed',
    'camera_fixed',
    'watermark',
    'return_last_frame',
    'service_tier',
    'execution_expires_after',
    'generate_audio',
    'draft',
    'tools',
  ])
  for (const key of Object.keys(request)) {
    if (!allowedTopLevelKeys.has(key)) throw new Error(`ARK_VIDEO_REQUEST_FIELD_UNSUPPORTED: ${key}`)
  }

  if (!isNonEmptyString(request.model)) throw new Error('ARK_VIDEO_REQUEST_INVALID: model is required')
  if (!Array.isArray(request.content) || request.content.length === 0) {
    throw new Error('ARK_VIDEO_REQUEST_INVALID: content must be a non-empty array')
  }

  const allowedRatios = new Set(['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'])
  if (request.ratio !== undefined && !allowedRatios.has(request.ratio)) {
    throw new Error(`ARK_VIDEO_REQUEST_INVALID: ratio=${request.ratio}`)
  }

  if (
    request.resolution !== undefined &&
    request.resolution !== '480p' &&
    request.resolution !== '720p' &&
    request.resolution !== '1080p'
  ) {
    throw new Error(`ARK_VIDEO_REQUEST_INVALID: resolution=${request.resolution}`)
  }

  if (request.duration !== undefined) {
    if (!isInteger(request.duration)) throw new Error('ARK_VIDEO_REQUEST_INVALID: duration must be integer')
    if (request.duration !== -1 && (request.duration < 2 || request.duration > 15)) {
      throw new Error(`ARK_VIDEO_REQUEST_INVALID: duration=${request.duration}`)
    }
  }

  if (request.frames !== undefined) {
    if (!isInteger(request.frames)) throw new Error('ARK_VIDEO_REQUEST_INVALID: frames must be integer')
    if (request.frames < 29 || request.frames > 289 || (request.frames - 25) % 4 !== 0) {
      throw new Error(`ARK_VIDEO_REQUEST_INVALID: frames=${request.frames}`)
    }
  }

  if (request.seed !== undefined) {
    if (!isInteger(request.seed)) throw new Error('ARK_VIDEO_REQUEST_INVALID: seed must be integer')
    if (request.seed < -1 || request.seed > 4294967295) {
      throw new Error(`ARK_VIDEO_REQUEST_INVALID: seed=${request.seed}`)
    }
  }

  if (request.execution_expires_after !== undefined) {
    if (!isInteger(request.execution_expires_after)) {
      throw new Error('ARK_VIDEO_REQUEST_INVALID: execution_expires_after must be integer')
    }
    if (request.execution_expires_after < 3600 || request.execution_expires_after > 259200) {
      throw new Error(`ARK_VIDEO_REQUEST_INVALID: execution_expires_after=${request.execution_expires_after}`)
    }
  }

  if (request.service_tier !== undefined && request.service_tier !== 'default' && request.service_tier !== 'flex') {
    throw new Error(`ARK_VIDEO_REQUEST_INVALID: service_tier=${String(request.service_tier)}`)
  }
}

export async function arkCreateVideoTask(
  request: ArkVideoTaskRequest,
  options: { apiKey: string; timeoutMs?: number; maxRetries?: number; logPrefix?: string },
): Promise<{ id: string; [key: string]: unknown }> {
  if (!options.apiKey) throw new Error('请配置火山引擎 API Key')
  validateArkVideoTaskRequest(request)

  const { apiKey, timeoutMs, maxRetries, logPrefix = '[Ark Video]' } = options
  const url = `${ARK_BASE_URL}/contents/generations/tasks`

  _ulogInfo(`${logPrefix} 创建视频任务, 模型: ${request.model}`)
  const response = await fetchWithTimeoutAndRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(request),
    timeoutMs,
    maxRetries,
    logPrefix,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`${logPrefix} 创建视频任务失败: ${response.status} - ${errorText}`)
  }

  const data = (await response.json()) as { id?: unknown; [key: string]: unknown }
  const taskId = typeof data.id === 'string' ? data.id : ''
  _ulogInfo(`${logPrefix} 视频任务创建成功, taskId: ${taskId}`)
  return { ...data, id: taskId }
}

export async function arkQueryVideoTask(
  taskId: string,
  options: { apiKey: string; timeoutMs?: number; maxRetries?: number; logPrefix?: string },
): Promise<ArkVideoTaskResponse> {
  if (!options.apiKey) throw new Error('请配置火山引擎 API Key')

  const { apiKey, timeoutMs, maxRetries, logPrefix = '[Ark Video]' } = options
  const url = `${ARK_BASE_URL}/contents/generations/tasks/${taskId}`

  const response = await fetchWithTimeoutAndRetry(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
    timeoutMs,
    maxRetries,
    logPrefix,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`${logPrefix} 查询视频任务失败: ${response.status} - ${errorText}`)
  }

  return (await response.json()) as ArkVideoTaskResponse
}

export async function executeArkVideoGeneration(input: AiProviderVideoExecutionContext) {
  const { prompt, ...providerOptions } = input.options || {}
  const generator = createVideoGenerator(input.selection.provider)
  return await generator.generate({
    userId: input.userId,
    imageUrl: input.imageUrl,
    prompt,
    options: {
      ...providerOptions,
      provider: input.selection.provider,
      modelId: input.selection.modelId,
      modelKey: input.selection.modelKey,
    },
  })
}
