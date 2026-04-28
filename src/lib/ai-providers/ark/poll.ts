import type { ProviderAsyncTaskStatus } from '@/lib/ai-providers/shared/async-task-status'
import { logInternal } from '@/lib/logging/semantic'

interface UnknownRecord {
  [key: string]: unknown
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' ? (value as UnknownRecord) : null
}

function readArkVideoUrl(content: unknown): string | undefined {
  const contentRecord = asRecord(content)
  if (contentRecord && typeof contentRecord.video_url === 'string' && contentRecord.video_url.trim()) {
    return contentRecord.video_url.trim()
  }

  if (!Array.isArray(content)) return undefined
  for (const item of content) {
    const itemRecord = asRecord(item)
    const videoUrl = asRecord(itemRecord?.video_url)
    if (videoUrl && typeof videoUrl.url === 'string' && videoUrl.url.trim()) {
      return videoUrl.url.trim()
    }
  }
  return undefined
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  const record = asRecord(error)
  if (record && typeof record.message === 'string') return record.message
  return String(error)
}

export async function querySeedanceVideoStatus(taskId: string, apiKey: string): Promise<ProviderAsyncTaskStatus> {
  if (!apiKey) {
    throw new Error('请配置火山引擎 API Key')
  }

  try {
    const queryResponse = await fetch(
      `https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/${taskId}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        cache: 'no-store',
      },
    )

    if (!queryResponse.ok) {
      logInternal('Seedance', 'ERROR', `Status query failed: ${queryResponse.status}`)
      return { status: 'pending' }
    }

    const queryData = await queryResponse.json() as {
      status?: unknown
      usage?: { total_tokens?: unknown }
      content?: unknown
      error?: { message?: unknown }
    }
    const status = queryData.status
    const actualVideoTokens = typeof queryData.usage?.total_tokens === 'number'
      ? queryData.usage.total_tokens
      : undefined

    if (status === 'succeeded') {
      const videoUrl = readArkVideoUrl(queryData.content)

      if (videoUrl) {
        return {
          status: 'completed',
          videoUrl,
          ...(typeof actualVideoTokens === 'number' ? { actualVideoTokens } : {}),
        }
      }

      return { status: 'failed', error: 'No video URL in response' }
    }

    if (status === 'failed') {
      const errorMessage = typeof queryData.error?.message === 'string' ? queryData.error.message : 'Unknown error'
      return { status: 'failed', error: errorMessage }
    }

    return { status: 'pending' }
  } catch (error: unknown) {
    logInternal('Seedance', 'ERROR', 'Query error', { error: getErrorMessage(error) })
    return { status: 'pending' }
  }
}
