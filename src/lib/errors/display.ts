import { resolveUnifiedErrorCode } from './codes'
import { getUserMessageByCode } from './user-messages'
import { normalizeAnyError } from './normalize'

/** 从原始错误消息中提取面向用户的关键细节 */
function extractProviderDetail(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null
  // 优先从 JSON 体中提取 "message" 字段（ARK / OpenRouter / 多数 OpenAI 兼容 API）
  const jsonMatch = raw.match(/\{.*"message"\s*:\s*"([^"]+)"/)
  if (jsonMatch?.[1]) return jsonMatch[1]
  // 兜底：移除内部前缀如 "[ARK Image] 图片生成失败: " ，保留核心描述
  const cleaned = raw
    .replace(/^\[[\w\s]+\]\s*/g, '')           // [ARK Image]
    .replace(/^[\w\s]+失败:\s*/g, '')           // 图片生成失败:
    .replace(/^\d{3}\s*-\s*/g, '')              // 400 -
    .trim()
  return cleaned || null
}

export function resolveErrorDisplay(input?: {
  code?: string | null
  message?: string | null
} | null) {
  if (!input) return null
  // code 和 message 都为空时，表示没有错误，直接返回 null
  // 如果不做这个判断，normalizeAnyError 会对空输入兜底返回 INTERNAL_ERROR，导致所有面板误报
  if (!input.code && !input.message) return null

  const code = resolveUnifiedErrorCode(input.code)
  if (code && code !== 'INTERNAL_ERROR') {
    const userMessage = getUserMessageByCode(code)
    if (code === 'VIDEO_API_FORMAT_UNSUPPORTED') {
      return {
        code,
        message: userMessage,
      }
    }
    // 尝试从原始 message 中提取 API 返回的具体细节
    const detail = extractProviderDetail(input.message)
    return {
      code,
      message: detail ? `${userMessage}\n${detail}` : userMessage,
    }
  }

  // 当 code 是兜底的 INTERNAL_ERROR 或 code 缺失时，尝试从 message 推断更具体的错误码
  // 这样像"敏感内容"、"余额不足"、"网络错误"等具体错误能正确显示
  const normalized = normalizeAnyError(
    { code: input.code || undefined, message: input.message || undefined },
    { context: 'api' },
  )
  if (normalized?.code) {
    const userMessage = getUserMessageByCode(normalized.code)
    const detail = extractProviderDetail(input.message)
    return {
      code: normalized.code,
      message: detail ? `${userMessage}\n${detail}` : userMessage,
    }
  }

  return null
}
