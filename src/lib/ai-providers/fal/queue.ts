import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
import { buildFalQueueUrl } from './base-url'

export interface FalQueueStatus {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
  completed: boolean
  failed: boolean
  resultUrl?: string
  error?: string
}

interface FalQueueInput {
  [key: string]: unknown
}

export async function submitFalTask(endpoint: string, input: FalQueueInput, apiKey: string): Promise<string> {
  if (!apiKey) {
    throw new Error('请配置 FAL API Key')
  }

  const response = await fetch(buildFalQueueUrl(endpoint), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`FAL提交失败 (${response.status}): ${errorText}`)
  }

  const data = await response.json() as { request_id?: unknown }
  const requestId = typeof data.request_id === 'string' ? data.request_id : ''

  if (!requestId) {
    throw new Error('FAL未返回request_id')
  }

  _ulogInfo(`[FAL Queue] 任务已提交: ${requestId}`)
  return requestId
}

function parseFalEndpointId(endpoint: string): { owner: string; alias: string; path?: string } {
  const parts = endpoint.split('/')
  return {
    owner: parts[0],
    alias: parts[1],
    path: parts.slice(2).join('/') || undefined,
  }
}

function readFalQueueResultUrl(resultData: unknown): string | undefined {
  if (!resultData || typeof resultData !== 'object') return undefined
  const data = resultData as {
    video?: { url?: unknown }
    audio?: { url?: unknown }
    images?: Array<{ url?: unknown }>
  }
  const videoUrl = typeof data.video?.url === 'string' ? data.video.url : ''
  const audioUrl = typeof data.audio?.url === 'string' ? data.audio.url : ''
  const imageUrl = Array.isArray(data.images) && typeof data.images[0]?.url === 'string' ? data.images[0].url : ''
  return videoUrl || audioUrl || imageUrl || undefined
}

function parseFalResultFetchError(status: number, errorText: string): FalQueueStatus | null {
  if (status === 422) {
    let errorMessage = '无法获取结果'
    try {
      const errorJson = JSON.parse(errorText) as { detail?: Array<{ type?: unknown }> }
      const errorType = errorJson.detail?.[0]?.type
      if (errorType === 'content_policy_violation') {
        errorMessage = '⚠️ 内容审核未通过：生成结果被拦截'
      } else if (typeof errorType === 'string' && errorType) {
        errorMessage = `FAL 错误: ${errorType}`
      }
    } catch { }

    _ulogError(`[FAL Status] 422 错误: ${errorMessage}`)
    return {
      status: 'COMPLETED',
      completed: true,
      failed: true,
      error: errorMessage,
    }
  }

  if (status === 500) {
    let errorDetail = '下游服务错误'
    try {
      const errorJson = JSON.parse(errorText) as { detail?: Array<{ type?: unknown }> }
      if (errorJson.detail?.[0]?.type === 'downstream_service_error') {
        errorDetail = 'FAL 下游服务错误：上游模型处理失败'
      }
    } catch { }

    _ulogError(`[FAL Status] 500 错误，标记任务为失败: ${errorDetail}`)
    return {
      status: 'COMPLETED',
      completed: true,
      failed: true,
      error: errorDetail,
    }
  }

  return null
}

export async function queryFalStatus(endpoint: string, requestId: string, apiKey: string): Promise<FalQueueStatus> {
  if (!apiKey) {
    throw new Error('请配置 FAL API Key')
  }

  const parsed = parseFalEndpointId(endpoint)
  const baseEndpoint = `${parsed.owner}/${parsed.alias}`

  if (parsed.path) {
    _ulogInfo(`[FAL Status] 解析端点 ${endpoint} -> ${baseEndpoint} (忽略路径: ${parsed.path})`)
  }

  const statusUrl = buildFalQueueUrl(`${baseEndpoint}/requests/${requestId}/status?logs=0`)
  const response = await fetch(statusUrl, {
    method: 'GET',
    headers: {
      Authorization: `Key ${apiKey}`,
    },
  })

  if (!response.ok) {
    return {
      status: 'IN_PROGRESS',
      completed: false,
      failed: false,
    }
  }

  const data = await response.json() as {
    status?: unknown
    response_url?: unknown
    error?: unknown
  }
  const status = data.status

  if (status !== 'IN_QUEUE' && status !== 'IN_PROGRESS' && status !== 'COMPLETED' && status !== 'FAILED') {
    return {
      status: 'IN_PROGRESS',
      completed: false,
      failed: false,
    }
  }

  _ulogInfo(`[FAL Status] requestId=${requestId.slice(0, 16)}... 状态=${status}`)

  if (status === 'COMPLETED') {
    const resultUrl = typeof data.response_url === 'string'
      ? data.response_url
      : buildFalQueueUrl(`${endpoint}/requests/${requestId}`)
    _ulogInfo(`[FAL Status] 任务已完成，获取结果: ${resultUrl}`)

    const resultResponse = await fetch(resultUrl, {
      method: 'GET',
      headers: {
        Authorization: `Key ${apiKey}`,
        Accept: 'application/json',
      },
    })

    if (resultResponse.ok) {
      const resultData = await resultResponse.json()
      const mediaUrl = readFalQueueResultUrl(resultData)

      _ulogInfo(`[FAL Status] 获取结果成功: hasMedia=${!!mediaUrl}`)

      if (!mediaUrl) {
        return {
          status: 'COMPLETED',
          completed: true,
          failed: true,
          error: 'FAL任务完成但未返回媒体URL',
        }
      }

      return {
        status: 'COMPLETED',
        completed: true,
        failed: false,
        resultUrl: mediaUrl,
      }
    }

    const errorText = await resultResponse.text()
    _ulogError(`[FAL Status] 获取结果失败 (${resultResponse.status}): ${errorText.slice(0, 300)}`)
    const terminalError = parseFalResultFetchError(resultResponse.status, errorText)
    if (terminalError) {
      return terminalError
    }

    return {
      status: 'IN_PROGRESS',
      completed: false,
      failed: false,
    }
  }

  if (status === 'FAILED') {
    return {
      status: 'FAILED',
      completed: false,
      failed: true,
      error: typeof data.error === 'string' && data.error.trim() ? data.error : '任务失败',
    }
  }

  return {
    status,
    completed: false,
    failed: false,
  }
}
