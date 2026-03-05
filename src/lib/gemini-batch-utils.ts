/**
 * Gemini Batch 工具函数
 * 
 * 用于提交和查询 Google Gemini Batch API 的任务
 * 参考: https://ai.google.dev/gemini-api/docs/batch-api
 * 
 * 特点：
 * - 价格是标准 API 的 50%
 * - 处理时间 24 小时内
 */

import { GoogleGenAI } from '@google/genai'
import { getImageBase64Cached } from './image-cache'
import { logInternal } from './logging/semantic'

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' ? (value as UnknownRecord) : null
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  const record = asRecord(error)
  if (record && typeof record.message === 'string') return record.message
  return String(error)
}

interface GeminiBatchClient {
  batches: {
    create(args: {
      model: string
      src: unknown[]
      config: { displayName: string }
    }): Promise<unknown>
    get(args: { name: string }): Promise<unknown>
  }
}

/**
 * 提交 Gemini Batch 图片生成任务
 * 
 * 使用 ai.batches.create() 方法提交批量任务
 * 
 * @param apiKey Google AI API Key
 * @param prompt 图片生成提示词
 * @param options 生成选项
 * @returns 返回 batchName（如 batches/xxx）用于后续查询
 */
export async function submitGeminiBatch(
  apiKey: string,
  prompt: string,
  options?: {
    referenceImages?: string[]
    aspectRatio?: string
    resolution?: string
  }
): Promise<{
  success: boolean
  batchName?: string
  error?: string
}> {
  if (!apiKey) {
    return { success: false, error: '请配置 Google AI API Key' }
  }

  try {
    const ai = new GoogleGenAI({ apiKey })

    // 构建 content parts
    const contentParts: UnknownRecord[] = []

    // 添加参考图片（最多 14 张）
    const referenceImages = options?.referenceImages || []
    for (let i = 0; i < Math.min(referenceImages.length, 14); i++) {
      const imageData = referenceImages[i]

      if (imageData.startsWith('data:')) {
        // Base64 格式
        const base64Start = imageData.indexOf(';base64,')
        if (base64Start !== -1) {
          const mimeType = imageData.substring(5, base64Start)
          const data = imageData.substring(base64Start + 8)
          contentParts.push({ inlineData: { mimeType, data } })
        }
      } else if (imageData.startsWith('http') || imageData.startsWith('/')) {
        // URL 格式（包括本地相对路径 /api/files/...）：下载转 base64
        try {
          // 🔧 本地模式修复：相对路径需要补全完整 URL
          let fullUrl = imageData
          if (imageData.startsWith('/')) {
            const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3533'
            fullUrl = `${baseUrl}${imageData}`
          }
          const base64DataUrl = await getImageBase64Cached(fullUrl)
          const base64Start = base64DataUrl.indexOf(';base64,')
          if (base64Start !== -1) {
            const mimeType = base64DataUrl.substring(5, base64Start)
            const data = base64DataUrl.substring(base64Start + 8)
            contentParts.push({ inlineData: { mimeType, data } })
          }
        } catch (e: unknown) {
          logInternal('GeminiBatch', 'WARN', `下载参考图片 ${i + 1} 失败`, { error: getErrorMessage(e) })
        }
      } else {
        // 纯 base64
        contentParts.push({
          inlineData: { mimeType: 'image/png', data: imageData }
        })
      }
    }

    // 添加文本提示
    contentParts.push({ text: prompt })

    // 构建内嵌请求（Inline Requests）
    // 🔥 添加 imageConfig 以控制输出图片的比例和尺寸
    const imageConfig: UnknownRecord = {}
    if (options?.aspectRatio) {
      imageConfig.aspectRatio = options.aspectRatio
    }
    if (options?.resolution) {
      imageConfig.imageSize = options.resolution  // 'HD', '4K' 等
    }

    const inlinedRequests = [
      {
        contents: [{ parts: contentParts }],
        config: {
          responseModalities: ['TEXT', 'IMAGE'],  // 🔥 必须指定包含 IMAGE
          ...(Object.keys(imageConfig).length > 0 && { imageConfig })  // 🔥 添加图片配置
        }
      }
    ]

    // 🔥 使用 ai.batches.create 创建批量任务
    const batchClient = ai as unknown as GeminiBatchClient
    const batchJob = await batchClient.batches.create({
      model: 'gemini-3-pro-image-preview',
      src: inlinedRequests,
      config: {
        displayName: `image-gen-${Date.now()}`
      }
    })

    const batchName = asRecord(batchJob)?.name  // 格式: batches/xxx

    if (typeof batchName !== 'string' || !batchName) {
      return { success: false, error: '未返回 batch name' }
    }

    logInternal('GeminiBatch', 'INFO', `✅ 任务已提交: ${batchName}`)
    return { success: true, batchName }

  } catch (error: unknown) {
    const message = getErrorMessage(error)
    logInternal('GeminiBatch', 'ERROR', '提交异常', { error: message })
    return { success: false, error: `提交异常: ${message}` }
  }
}

/**
 * 查询 Gemini Batch 任务状态
 * 
 * 使用 ai.batches.get() 方法查询任务状态
 * 
 * @param batchName 批量任务名称（如 batches/xxx）
 * @param apiKey Google AI API Key
 */
export async function queryGeminiBatchStatus(batchName: string, apiKey: string): Promise<{
  status: string
  completed: boolean
  failed: boolean
  imageBase64?: string
  imageUrl?: string
  error?: string
}> {
  if (!apiKey) {
    return { status: 'error', completed: false, failed: true, error: '请配置 Google AI API Key' }
  }

  try {
    const ai = new GoogleGenAI({ apiKey })

    // 🔥 使用 ai.batches.get 查询任务状态
    const batchClient = ai as unknown as GeminiBatchClient
    const batchJob = await batchClient.batches.get({ name: batchName })
    const batchRecord = asRecord(batchJob) || {}

    const state = typeof batchRecord.state === 'string' ? batchRecord.state : 'UNKNOWN'
    logInternal('GeminiBatch', 'INFO', `查询状态: ${batchName} -> ${state}`)

    // 检查完成状态
    const completedStates = new Set([
      'JOB_STATE_SUCCEEDED'
    ])
    const failedStates = new Set([
      'JOB_STATE_FAILED',
      'JOB_STATE_CANCELLED',
      'JOB_STATE_EXPIRED'
    ])

    if (completedStates.has(state)) {
      // 从 inlinedResponses 中提取图片
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

            logInternal('GeminiBatch', 'INFO', `✅ 获取到图片，MIME 类型: ${mimeType}`, { batchName })
            return {
              status: 'completed',
              completed: true,
              failed: false,
              imageBase64,
              imageUrl: `data:${mimeType};base64,${imageBase64}`
            }
          }
        }
      }

      // 任务完成但没有图片
      return {
        status: 'completed_no_image',
        completed: false,
        failed: true,
        error: '任务完成但未找到图片（可能被内容安全策略过滤）'
      }
    }

    if (failedStates.has(state)) {
      return {
        status: state,
        completed: false,
        failed: true,
        error: `任务失败: ${state}`
      }
    }

    // 仍在处理中 (PENDING, RUNNING 等)
    return { status: state, completed: false, failed: false }

  } catch (error: unknown) {
    const message = getErrorMessage(error)
    logInternal('GeminiBatch', 'ERROR', '查询异常', { batchName, error: message })
    return { status: 'error', completed: false, failed: false, error: `查询异常: ${message}` }
  }
}
