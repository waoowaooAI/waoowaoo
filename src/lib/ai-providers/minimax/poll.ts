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

export async function queryMinimaxTaskStatus(taskId: string, apiKey: string): Promise<ProviderAsyncTaskStatus> {
  const logPrefix = '[MiniMax Query]'

  try {
    const response = await fetch(`https://api.minimaxi.com/v1/query/video_generation?task_id=${taskId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      _ulogError(`${logPrefix} 查询失败:`, response.status, errorText)
      return {
        status: 'failed',
        error: `查询失败: ${response.status}`,
      }
    }

    const data = await response.json() as {
      base_resp?: { status_code?: unknown; status_msg?: unknown }
      status?: unknown
      file_id?: unknown
      error_message?: unknown
    }

    if (data.base_resp?.status_code !== 0) {
      const errMsg = typeof data.base_resp?.status_msg === 'string' ? data.base_resp.status_msg : '未知错误'
      _ulogError(`${logPrefix} task_id=${taskId} 错误:`, errMsg)
      return {
        status: 'failed',
        error: errMsg,
      }
    }

    const status = data.status

    if (status === 'Success') {
      const fileId = typeof data.file_id === 'string' ? data.file_id : ''
      if (!fileId) {
        _ulogError(`${logPrefix} task_id=${taskId} 成功但无file_id`)
        return {
          status: 'failed',
          error: '任务完成但未返回视频',
        }
      }

      _ulogInfo(`${logPrefix} task_id=${taskId} 完成，正在获取下载URL...`)
      try {
        const fileResponse = await fetch(`https://api.minimaxi.com/v1/files/retrieve?file_id=${fileId}`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        })

        if (!fileResponse.ok) {
          const errorText = await fileResponse.text()
          _ulogError(`${logPrefix} 文件检索失败:`, fileResponse.status, errorText)
          return {
            status: 'failed',
            error: `文件检索失败: ${fileResponse.status}`,
          }
        }

        const fileData = await fileResponse.json() as { file?: { download_url?: unknown } }
        const downloadUrl = typeof fileData.file?.download_url === 'string' ? fileData.file.download_url : ''

        if (!downloadUrl) {
          _ulogError(`${logPrefix} 文件检索成功但无download_url:`, fileData)
          return {
            status: 'failed',
            error: '无法获取视频下载链接',
          }
        }

        _ulogInfo(`${logPrefix} 获取下载URL成功: ${downloadUrl.substring(0, 80)}...`)
        return {
          status: 'completed',
          videoUrl: downloadUrl,
        }
      } catch (error: unknown) {
        const errorMessage = getErrorMessage(error)
        _ulogError(`${logPrefix} 文件检索异常:`, error)
        return {
          status: 'failed',
          error: `文件检索失败: ${errorMessage}`,
        }
      }
    }

    if (status === 'Failed') {
      const errMsg = typeof data.error_message === 'string' && data.error_message.trim()
        ? data.error_message
        : '生成失败'
      _ulogError(`${logPrefix} task_id=${taskId} 失败:`, errMsg)
      return {
        status: 'failed',
        error: errMsg,
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
      error: errorMessage,
    }
  }
}

