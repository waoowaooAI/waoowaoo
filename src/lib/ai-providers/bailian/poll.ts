import type { ProviderAsyncTaskStatus } from '@/lib/ai-providers/shared/async-task-status'

interface BailianTaskQueryResultItem {
  url?: string
  video_url?: string
  image_url?: string
}

interface BailianTaskQueryResponse {
  code?: string
  message?: string
  task_status?: string
  output?: {
    task_status?: string
    code?: string
    message?: string
    video_url?: string
    image_url?: string
    results?: BailianTaskQueryResultItem[]
  }
}

export function readBailianTaskQueryMediaUrl(data: BailianTaskQueryResponse): {
  mediaUrl?: string
  videoUrl?: string
  imageUrl?: string
} {
  const output = data.output
  const videoUrl = typeof output?.video_url === 'string' ? output.video_url.trim() : ''
  if (videoUrl) {
    return { mediaUrl: videoUrl, videoUrl }
  }

  const imageUrl = typeof output?.image_url === 'string' ? output.image_url.trim() : ''
  if (imageUrl) {
    return { mediaUrl: imageUrl, imageUrl }
  }

  const firstResult = Array.isArray(output?.results) ? output.results[0] : undefined
  if (!firstResult || typeof firstResult !== 'object') {
    return {}
  }
  const firstVideoUrl = typeof firstResult.video_url === 'string' ? firstResult.video_url.trim() : ''
  if (firstVideoUrl) {
    return { mediaUrl: firstVideoUrl, videoUrl: firstVideoUrl }
  }
  const firstImageUrl = typeof firstResult.image_url === 'string' ? firstResult.image_url.trim() : ''
  if (firstImageUrl) {
    return { mediaUrl: firstImageUrl, imageUrl: firstImageUrl }
  }
  const firstUrl = typeof firstResult.url === 'string' ? firstResult.url.trim() : ''
  if (firstUrl) {
    return { mediaUrl: firstUrl }
  }

  return {}
}

function parseBailianTaskQueryResponse(raw: string): BailianTaskQueryResponse {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object') {
      return parsed as BailianTaskQueryResponse
    }
    throw new Error('BAILIAN_TASK_QUERY_RESPONSE_INVALID')
  } catch {
    throw new Error('BAILIAN_TASK_QUERY_RESPONSE_INVALID_JSON')
  }
}

function readBailianTaskStatus(data: BailianTaskQueryResponse): string {
  return (typeof data.output?.task_status === 'string'
    ? data.output.task_status
    : typeof data.task_status === 'string'
      ? data.task_status
      : '').trim().toUpperCase()
}

export async function queryBailianTaskStatus(requestId: string, apiKey: string): Promise<ProviderAsyncTaskStatus> {
  const response = await fetch(
    `https://dashscope.aliyuncs.com/api/v1/tasks/${encodeURIComponent(requestId)}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  )

  const raw = await response.text()
  const data = parseBailianTaskQueryResponse(raw)
  const outputCode = typeof data.output?.code === 'string' ? data.output.code.trim() : ''
  const outputMessage = typeof data.output?.message === 'string' ? data.output.message.trim() : ''
  const topLevelCode = typeof data.code === 'string' ? data.code.trim() : ''
  const topLevelMessage = typeof data.message === 'string' ? data.message.trim() : ''
  const resolvedCode = outputCode || topLevelCode
  const resolvedMessage = outputMessage || topLevelMessage

  if (!response.ok) {
    return {
      status: 'failed',
      error: `Bailian: 查询失败 ${response.status} ${resolvedCode || resolvedMessage}`.trim(),
    }
  }

  const taskStatus = readBailianTaskStatus(data)

  if (taskStatus === 'FAILED' || taskStatus === 'CANCELED' || taskStatus === 'CANCELLED') {
    return {
      status: 'failed',
      error: `Bailian: ${resolvedCode || resolvedMessage || '任务失败'}`,
    }
  }

  if (taskStatus === 'SUCCEEDED' || taskStatus === 'SUCCESS') {
    const { mediaUrl, videoUrl, imageUrl } = readBailianTaskQueryMediaUrl(data)
    if (!mediaUrl) {
      return {
        status: 'failed',
        error: 'Bailian: 任务完成但未返回结果URL',
      }
    }
    return {
      status: 'completed',
      videoUrl,
      imageUrl,
    }
  }

  return {
    status: 'pending',
  }
}

