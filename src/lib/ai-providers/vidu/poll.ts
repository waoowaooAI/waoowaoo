import type { ProviderAsyncTaskStatus } from '@/lib/ai-providers/shared/async-task-status'
import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null) {
    const candidate = (error as { message?: unknown }).message
    if (typeof candidate === 'string') return candidate
  }
  return '查询异常'
}

export async function queryViduTaskStatus(taskId: string, apiKey: string): Promise<ProviderAsyncTaskStatus> {
  const logPrefix = '[Vidu Query]'

  try {
    _ulogInfo(`${logPrefix} 查询任务 task_id=${taskId}`)

    const response = await fetch(`https://api.vidu.cn/ent/v2/tasks/${taskId}/creations`, {
      headers: {
        Authorization: `Token ${apiKey}`,
      },
    })

    _ulogInfo(`${logPrefix} HTTP状态: ${response.status}`)

    if (!response.ok) {
      const errorText = await response.text()
      _ulogError(`${logPrefix} 查询失败:`, response.status, errorText)
      return {
        status: 'failed',
        error: `Vidu: 查询失败 ${response.status}`,
      }
    }

    const data = await response.json() as {
      state?: unknown
      creations?: Array<{ url?: unknown }>
      err_code?: unknown
    }
    _ulogInfo(`${logPrefix} 响应数据:`, JSON.stringify(data, null, 2))

    const state = data.state

    if (state === 'success') {
      const creations = data.creations
      if (!creations || creations.length === 0) {
        _ulogError(`${logPrefix} task_id=${taskId} 成功但无生成物`)
        return {
          status: 'failed',
          error: 'Vidu: 任务完成但未返回视频',
        }
      }

      const videoUrl = typeof creations[0]?.url === 'string' ? creations[0].url : ''
      if (!videoUrl) {
        _ulogError(`${logPrefix} task_id=${taskId} 成功但生成物无URL`)
        return {
          status: 'failed',
          error: 'Vidu: 任务完成但未返回视频URL',
        }
      }

      _ulogInfo(`${logPrefix} task_id=${taskId} 完成，视频URL: ${videoUrl.substring(0, 80)}...`)
      return {
        status: 'completed',
        videoUrl,
      }
    }

    if (state === 'failed') {
      const errCode = typeof data.err_code === 'string' && data.err_code.trim() ? data.err_code : 'Unknown'
      _ulogError(`${logPrefix} task_id=${taskId} 失败: ${errCode}`)
      return {
        status: 'failed',
        error: `Vidu: ${errCode}`,
      }
    }

    return {
      status: 'pending',
    }
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error)
    _ulogError(`${logPrefix} task_id=${taskId} 异常:`, error)
    return {
      status: 'failed',
      error: `Vidu: ${errorMessage}`,
    }
  }
}

