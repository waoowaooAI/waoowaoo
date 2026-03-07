import { normalizeAnyError } from '@/lib/errors/normalize'
import type { AiRuntimeError, AiRuntimeErrorCode } from './types'

function toCode(value: string): AiRuntimeErrorCode {
  if (value === 'NETWORK_ERROR') return 'NETWORK_ERROR'
  if (value === 'RATE_LIMIT') return 'RATE_LIMIT'
  if (value === 'EMPTY_RESPONSE') return 'EMPTY_RESPONSE'
  if (value === 'GENERATION_TIMEOUT') return 'TIMEOUT'
  if (value === 'SENSITIVE_CONTENT') return 'SENSITIVE_CONTENT'
  if (value === 'PARSING_ERROR') return 'PARSE_ERROR'
  return 'INTERNAL_ERROR'
}

function inferEmptyResponse(message: string): boolean {
  const normalized = message.toLowerCase()
  return normalized.includes('stream_empty')
    || normalized.includes('empty response')
    || normalized.includes('no meaningful content')
    || normalized.includes('channel:empty_response')
}

function hasEmptyResponseSignal(input: unknown): boolean {
  const queue: unknown[] = [input]
  const visited = new Set<object>()
  let scannedCount = 0

  while (queue.length > 0 && scannedCount < 100) {
    const current = queue.shift()
    scannedCount += 1
    if (current === null || current === undefined) continue

    if (typeof current === 'string') {
      if (inferEmptyResponse(current)) return true
      continue
    }

    if (current instanceof Error) {
      if (inferEmptyResponse(current.message || '')) return true
      const errorWithCause = current as Error & { cause?: unknown } & Record<string, unknown>
      queue.push(errorWithCause.cause)
      queue.push(errorWithCause.error)
      queue.push(errorWithCause.details)
      queue.push(errorWithCause.response)
      continue
    }

    if (Array.isArray(current)) {
      for (const item of current) {
        queue.push(item)
      }
      continue
    }

    if (typeof current !== 'object') {
      continue
    }

    if (visited.has(current)) {
      continue
    }
    visited.add(current)

    const record = current as Record<string, unknown>
    for (const value of Object.values(record)) {
      queue.push(value)
    }
  }

  return false
}

export function toAiRuntimeError(input: unknown): AiRuntimeError {
  const normalized = normalizeAnyError(input, { context: 'worker' })
  const message = normalized.message || 'AI request failed'
  const isEmptyResponse = inferEmptyResponse(message) || hasEmptyResponseSignal(input)
  const code = isEmptyResponse
    ? 'EMPTY_RESPONSE'
    : toCode(normalized.code)

  const error = new Error(message) as AiRuntimeError
  error.code = code
  error.retryable = code === 'EMPTY_RESPONSE' ? true : normalized.retryable
  error.provider = normalized.provider || null
  error.cause = input
  return error
}
