import type { ProviderAsyncTaskStatus } from '@/lib/ai-providers/shared/async-task-status'
import { logInternal } from '@/lib/logging/semantic'

interface UnknownRecord {
  [key: string]: unknown
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' ? (value as UnknownRecord) : null
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  const record = asRecord(error)
  if (record && typeof record.message === 'string') return record.message
  return String(error)
}

function getErrorStatus(error: unknown): number | undefined {
  const record = asRecord(error)
  if (!record) return undefined
  return typeof record.status === 'number' ? record.status : undefined
}

interface GeminiBatchClient {
  batches: {
    get(args: { name: string }): Promise<unknown>
  }
}

export async function queryGeminiBatchStatus(batchName: string, apiKey: string): Promise<ProviderAsyncTaskStatus> {
  if (!apiKey) {
    throw new Error('请配置 Google AI API Key')
  }

  try {
    const { GoogleGenAI } = await import('@google/genai')
    const ai = new GoogleGenAI({ apiKey })
    const batchClient = ai as unknown as GeminiBatchClient
    const batchJob = await batchClient.batches.get({ name: batchName })
    const batchRecord = asRecord(batchJob) || {}

    const state = typeof batchRecord.state === 'string' ? batchRecord.state : 'UNKNOWN'
    logInternal('GeminiBatch', 'INFO', `查询状态: ${batchName} -> ${state}`)

    if (state === 'JOB_STATE_SUCCEEDED') {
      const dest = asRecord(batchRecord.dest)
      const responses = Array.isArray(dest?.inlinedResponses) ? dest.inlinedResponses : []

      if (responses.length > 0) {
        const firstResponse = asRecord(responses[0])
        const response = asRecord(firstResponse?.response)
        const candidates = Array.isArray(response?.candidates) ? response.candidates : []
        const firstCandidate = asRecord(candidates[0])
        const content = asRecord(firstCandidate?.content)
        const parts = Array.isArray(content?.parts) ? content.parts : []

        for (const part of parts) {
          const partRecord = asRecord(part)
          const inlineData = asRecord(partRecord?.inlineData)
          if (typeof inlineData?.data === 'string') {
            const imageBase64 = inlineData.data
            const mimeType = typeof inlineData.mimeType === 'string' ? inlineData.mimeType : 'image/png'
            const imageUrl = `data:${mimeType};base64,${imageBase64}`

            logInternal('GeminiBatch', 'INFO', `✅ 获取到图片，MIME 类型: ${mimeType}`, { batchName })
            return { status: 'completed', imageUrl }
          }
        }
      }

      return { status: 'failed', error: 'No image data in batch result' }
    }

    if (state === 'JOB_STATE_FAILED' || state === 'JOB_STATE_CANCELLED' || state === 'JOB_STATE_EXPIRED') {
      return { status: 'failed', error: `Gemini Batch failed: ${state}` }
    }

    return { status: 'pending' }
  } catch (error: unknown) {
    const message = getErrorMessage(error)
    const status = getErrorStatus(error)
    logInternal('GeminiBatch', 'ERROR', 'Query error', { batchName, error: message, status })
    if (status === 404 || message.includes('404') || message.includes('not found') || message.includes('NOT_FOUND')) {
      return { status: 'failed', error: 'Batch task not found' }
    }
    return { status: 'pending' }
  }
}

export async function queryGoogleVideoStatus(operationName: string, apiKey: string): Promise<ProviderAsyncTaskStatus> {
  if (!apiKey) {
    throw new Error('请配置 Google AI API Key')
  }

  const logPrefix = '[Veo Query]'

  try {
    const { GoogleGenAI, GenerateVideosOperation } = await import('@google/genai')
    const ai = new GoogleGenAI({ apiKey })
    const operation = new GenerateVideosOperation()
    operation.name = operationName
    const op = await ai.operations.getVideosOperation({ operation })

    logInternal('Veo', 'INFO', `${logPrefix} 原始响应`, {
      operationName,
      done: op.done,
      hasError: !!op.error,
      hasResponse: !!op.response,
      responseKeys: op.response ? Object.keys(op.response) : [],
      generatedVideosCount: op.response?.generatedVideos?.length ?? 0,
      raiFilteredCount: (op.response as UnknownRecord)?.raiMediaFilteredCount ?? null,
      raiFilteredReasons: (op.response as UnknownRecord)?.raiMediaFilteredReasons ?? null,
    })

    if (!op.done) {
      return { status: 'pending' }
    }

    if (op.error) {
      const errRecord = asRecord(op.error)
      const message = (typeof errRecord?.message === 'string' && errRecord.message)
        || (typeof errRecord?.statusMessage === 'string' && errRecord.statusMessage)
        || 'Veo 任务失败'
      logInternal('Veo', 'ERROR', `${logPrefix} 操作级错误`, { operationName, error: op.error })
      return { status: 'failed', error: message }
    }

    const response = op.response
    if (!response) {
      logInternal('Veo', 'ERROR', `${logPrefix} done=true 但 response 为空`, { operationName })
      return { status: 'failed', error: 'Veo 任务完成但响应体为空' }
    }

    const responseRecord = asRecord(response) || {}
    const raiFilteredCount = responseRecord.raiMediaFilteredCount
    const raiFilteredReasons = responseRecord.raiMediaFilteredReasons

    if (typeof raiFilteredCount === 'number' && raiFilteredCount > 0) {
      const reasons = Array.isArray(raiFilteredReasons)
        ? raiFilteredReasons.join(', ')
        : '未知原因'
      logInternal('Veo', 'ERROR', `${logPrefix} 视频被 RAI 安全策略过滤`, {
        operationName,
        raiFilteredCount,
        raiFilteredReasons: reasons,
      })
      return {
        status: 'failed',
        error: `Veo 视频被安全策略过滤 (${raiFilteredCount} 个视频被过滤, 原因: ${reasons})`,
      }
    }

    const generatedVideos = response.generatedVideos
    if (Array.isArray(generatedVideos) && generatedVideos.length > 0) {
      const first = generatedVideos[0]
      const videoUri = first?.video?.uri

      if (videoUri) {
        logInternal('Veo', 'INFO', `${logPrefix} 成功获取视频`, {
          operationName,
          videoUri: videoUri.substring(0, 80),
        })
        return { status: 'completed', videoUrl: videoUri }
      }

      logInternal('Veo', 'ERROR', `${logPrefix} generatedVideos[0] 存在但无 video.uri`, {
        operationName,
        firstVideo: JSON.stringify(first, null, 2),
      })
      return { status: 'failed', error: 'Veo 视频对象存在但缺少 URI' }
    }

    logInternal('Veo', 'ERROR', `${logPrefix} 无 generatedVideos`, {
      operationName,
      responseKeys: Object.keys(responseRecord),
      fullResponse: JSON.stringify(responseRecord, null, 2).substring(0, 2000),
      raiFilteredCount: raiFilteredCount ?? 'N/A',
      raiFilteredReasons: raiFilteredReasons ?? 'N/A',
    })
    return { status: 'failed', error: 'Veo 任务完成但未返回视频 (generatedVideos 为空)' }
  } catch (error: unknown) {
    const message = getErrorMessage(error)
    logInternal('Veo', 'ERROR', `${logPrefix} 查询异常`, { operationName, error: message })
    return { status: 'failed', error: message }
  }
}
