import { InsufficientBalanceError } from '@/lib/billing/errors'
import { getPrismaErrorCode, isLikelyPrismaDisconnectError, isPrismaRetryableCode } from '@/lib/prisma-error'
import { DEFAULT_ERROR_CODE, getErrorSpec, isKnownErrorCode, resolveUnifiedErrorCode, type UnifiedErrorCode } from './codes'
import type { ErrorContext, NormalizedError, NormalizedErrorDetails } from './types'

type NormalizeOptions = {
  context?: ErrorContext
  fallbackCode?: UnifiedErrorCode
  details?: Record<string, unknown> | null
}

type ErrorLike = {
  code?: unknown
  status?: unknown
  message?: unknown
  details?: unknown
  provider?: unknown
}

function toMessage(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (value instanceof Error && value.message.trim()) return value.message.trim()
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function toLowerMessage(value: unknown): string {
  return toMessage(value).toLowerCase()
}

function containsAny(haystack: string, needles: string[]) {
  for (const needle of needles) {
    if (haystack.includes(needle)) return true
  }
  return false
}

function isModelNotOpenCode(code: unknown): boolean {
  if (typeof code !== 'string') return false
  const normalized = code.trim().toUpperCase()
  return normalized === 'MODELNOTOPEN' || normalized === 'MODEL_NOT_OPEN'
}

function isModelNotOpenMessage(message: string): boolean {
  return containsAny(message, [
    'modelnotopen',
    'has not activated the model',
    'not activated the model',
    'activate the model service in the ark console',
  ])
}

function isModelNotRegisteredMessage(message: string): boolean {
  return containsAny(message, [
    'model_not_registered',
    'model not registered',
  ])
}

function isEmptyResponseMessage(message: string): boolean {
  return containsAny(message, [
    'channel:empty_response',
    'empty response',
    'no meaningful content in candidates',
    'stream_empty',
  ])
}

function isVideoApiFormatUnsupportedMessage(message: string): boolean {
  if (containsAny(message, [
    'video_api_format_unsupported',
    'openai_compat_video_template_required',
    'openai_compat_video_template_media_type_invalid',
    'openai_compat_video_template_create_body_required',
    'openai_compat_video_template_output_not_found',
    'openai_compat_video_template_task_id_not_found',
    'openai_compat_template_variable_missing',
    'openai_compat_template_multipart_body_invalid',
    'openai_compat_template_multipart_file_invalid',
  ])) {
    return true
  }

  const templateStatusMatch = message.match(/template request failed with status (\d{3})/i)
  if (!templateStatusMatch) return false

  const parsedStatus = Number.parseInt(templateStatusMatch[1] || '', 10)
  return parsedStatus === 404 || parsedStatus === 405 || parsedStatus === 415
}

function buildNormalizedError(
  code: UnifiedErrorCode,
  message?: string,
  details: NormalizedErrorDetails = null,
  provider?: string | null,
): NormalizedError {
  const spec = getErrorSpec(code)
  return {
    code,
    message: message?.trim() || spec.defaultMessage,
    httpStatus: spec.httpStatus,
    retryable: spec.retryable,
    category: spec.category,
    userMessageKey: spec.userMessageKey,
    details,
    provider: provider || null,
  }
}

function inferCodeFromMessage(message: string): UnifiedErrorCode | null {
  const upper = message.toUpperCase()
  const explicitMatch = upper.match(/\b([A-Z_]{3,})\b/)
  if (explicitMatch && isKnownErrorCode(explicitMatch[1])) {
    return explicitMatch[1]
  }

  const statusMatch = message.match(/\bstatus\s+(\d{3})\b/)
  if (statusMatch) {
    const parsedStatus = Number.parseInt(statusMatch[1] || '', 10)
    if (Number.isFinite(parsedStatus)) {
      if (parsedStatus === 404 || parsedStatus === 405 || parsedStatus === 415) {
        return 'VIDEO_API_FORMAT_UNSUPPORTED'
      }
      if (parsedStatus === 401) return 'UNAUTHORIZED'
      if (parsedStatus === 403) return 'FORBIDDEN'
      if (parsedStatus === 404) return 'NOT_FOUND'
      if (parsedStatus === 409) return 'CONFLICT'
      if (parsedStatus === 422) return 'SENSITIVE_CONTENT'
      if (parsedStatus === 429) return 'RATE_LIMIT'
      if (parsedStatus === 502 || parsedStatus === 503) return 'EXTERNAL_ERROR'
      if (parsedStatus === 504) return 'GENERATION_TIMEOUT'
      if (parsedStatus >= 500) return 'EXTERNAL_ERROR'
      if (parsedStatus >= 400) return 'INVALID_PARAMS'
    }
  }

  if (isModelNotOpenMessage(message)) return 'MODEL_NOT_OPEN'
  if (isModelNotRegisteredMessage(message)) return 'MODEL_NOT_REGISTERED'
  if (isEmptyResponseMessage(message)) return 'EMPTY_RESPONSE'
  if (isVideoApiFormatUnsupportedMessage(message)) return 'VIDEO_API_FORMAT_UNSUPPORTED'
  if (containsAny(message, ['task cancelled', 'canceled by user', 'cancelled by user', '任务已取消'])) return 'CONFLICT'
  if (containsAny(message, ['unauthorized', 'not authenticated', 'need login', '401'])) return 'UNAUTHORIZED'
  if (containsAny(message, ['forbidden', 'permission denied', '403'])) return 'FORBIDDEN'
  if (containsAny(message, ['not found', '不存在', 'missing record'])) return 'NOT_FOUND'
  if (containsAny(message, ['invalid', 'missing', 'required', 'bad request', 'fieldinvalid'])) return 'INVALID_PARAMS'
  if (containsAny(message, ['quota', 'rate limit', 'resource_exhausted', 'throttle', '429'])) return 'RATE_LIMIT'
  if (containsAny(message, ['insufficient balance', 'creditinsufficient', 'balance is not enough', '402', 'insufficient credits', '余额不足', '余额不够', '请充值'])) return 'INSUFFICIENT_BALANCE'
  if (containsAny(message, ['sensitive', 'unsafe', 'safety', 'blocked', 'prohibited', 'policy_violation', 'moderation', 'harm', '敏感', '违规', '不当', '安全策略', '被过滤']) && !containsAny(message, ['case-sensitive', 'case sensitive'])) return 'SENSITIVE_CONTENT'
  if (containsAny(message, ['timeout', 'timed out', 'deadline exceeded'])) return 'GENERATION_TIMEOUT'
  if (containsAny(message, ['503', 'unavailable', 'overloaded', 'upstream error'])) return 'EXTERNAL_ERROR'
  if (containsAny(message, ['network', 'fetch failed', 'econnreset', 'enotfound', 'econnrefused', 'eai_again', 'terminated', 'aborted', 'socket hang up'])) return 'NETWORK_ERROR'
  if (containsAny(message, ['conflict', 'already exists', 'duplicate'])) return 'CONFLICT'
  return null
}

function inferCodeFromPrismaCode(prismaCode: string): UnifiedErrorCode {
  if (prismaCode === 'P2002') return 'CONFLICT'
  if (prismaCode === 'P2001' || prismaCode === 'P2025') return 'NOT_FOUND'
  if (isPrismaRetryableCode(prismaCode)) return 'EXTERNAL_ERROR'
  return 'INTERNAL_ERROR'
}

export function normalizeAnyError(input: unknown, options: NormalizeOptions = {}): NormalizedError {
  const fallbackCode = options.fallbackCode || DEFAULT_ERROR_CODE
  const errorLike = (input || {}) as ErrorLike
  const message = toMessage(errorLike.message ?? input)
  const lowerMessage = toLowerMessage(message)
  const provider = typeof errorLike.provider === 'string' ? errorLike.provider : null

  if (input instanceof TypeError) {
    if (lowerMessage === 'terminated' || containsAny(lowerMessage, ['aborted', 'socket hang up'])) {
      return buildNormalizedError(
        'NETWORK_ERROR',
        message || 'Network request terminated',
        options.details,
        provider,
      )
    }
  }

  const prismaCode = getPrismaErrorCode(input)
  if (prismaCode) {
    return buildNormalizedError(
      inferCodeFromPrismaCode(prismaCode),
      message || `Database request failed (${prismaCode})`,
      {
        prismaCode,
        ...(options.details || {}),
      },
      provider,
    )
  }

  if (isLikelyPrismaDisconnectError(input)) {
    return buildNormalizedError(
      'EXTERNAL_ERROR',
      message || 'Database connection unavailable',
      options.details,
      provider,
    )
  }

  if (input instanceof InsufficientBalanceError) {
    return buildNormalizedError('INSUFFICIENT_BALANCE', message || input.message, {
      required: input.required,
      available: input.available,
      ...(options.details || {}),
    })
  }

  const resolvedCode = resolveUnifiedErrorCode(errorLike.code)
  if (resolvedCode) {
    return buildNormalizedError(resolvedCode, message, {
      ...(typeof errorLike.details === 'object' && errorLike.details ? (errorLike.details as Record<string, unknown>) : {}),
      ...(options.details || {}),
    }, provider)
  }

  if (isModelNotOpenCode(errorLike.code) || isModelNotOpenMessage(lowerMessage)) {
    return buildNormalizedError('MODEL_NOT_OPEN', message, options.details, provider)
  }
  if (isModelNotRegisteredMessage(lowerMessage)) {
    return buildNormalizedError('MODEL_NOT_REGISTERED', message, options.details, provider)
  }

  if (isEmptyResponseMessage(lowerMessage)) {
    return buildNormalizedError('EMPTY_RESPONSE', message, options.details, provider)
  }

  if (typeof errorLike.status === 'number') {
    if (errorLike.status === 401) return buildNormalizedError('UNAUTHORIZED', message, options.details, provider)
    if (errorLike.status === 403) return buildNormalizedError('FORBIDDEN', message, options.details, provider)
    if (errorLike.status === 404) return buildNormalizedError('NOT_FOUND', message, options.details, provider)
    if (errorLike.status === 409) return buildNormalizedError('CONFLICT', message, options.details, provider)
    if (errorLike.status === 422) return buildNormalizedError('SENSITIVE_CONTENT', message, options.details, provider)
    if (errorLike.status === 429) return buildNormalizedError('RATE_LIMIT', message, options.details, provider)
    if (errorLike.status === 502 || errorLike.status === 503) return buildNormalizedError('EXTERNAL_ERROR', message, options.details, provider)
    if (errorLike.status === 504) return buildNormalizedError('GENERATION_TIMEOUT', message, options.details, provider)
  }

  const inferredCode = inferCodeFromMessage(lowerMessage)
  if (inferredCode) {
    return buildNormalizedError(inferredCode, message, options.details, provider)
  }

  if (options.context === 'worker' && containsAny(lowerMessage, ['provider', 'generation failed'])) {
    return buildNormalizedError('GENERATION_FAILED', message, options.details, provider)
  }

  return buildNormalizedError(fallbackCode, message || getErrorSpec(fallbackCode).defaultMessage, options.details, provider)
}

export function normalizeTaskError(
  code: string | null | undefined,
  message: string | null | undefined,
  details: Record<string, unknown> | null = null,
): NormalizedError | null {
  if (!code && !message) return null

  if (code === 'TASK_CANCELLED') {
    return buildNormalizedError(
      'CONFLICT',
      message || 'Task cancelled by user',
      {
        ...(details || {}),
        cancelled: true,
        originalCode: code,
      },
    )
  }

  const resolvedTaskCode = resolveUnifiedErrorCode(code)
  if (resolvedTaskCode) {
    return buildNormalizedError(resolvedTaskCode, message || undefined, details)
  }

  const inferred = normalizeAnyError(
    {
      code,
      message,
      details,
    },
    {
      fallbackCode: DEFAULT_ERROR_CODE,
    },
  )

  if (code && !resolveUnifiedErrorCode(code)) {
    return {
      ...inferred,
      details: {
        ...(inferred.details || {}),
        originalCode: code,
      },
    }
  }

  return inferred
}
