import { describe, expect, it } from 'vitest'
import { normalizeAnyError } from '@/lib/errors/normalize'

describe('normalizeAnyError network termination mapping', () => {
  it('maps undici terminated TypeError to NETWORK_ERROR', () => {
    const normalized = normalizeAnyError(new TypeError('terminated'))
    expect(normalized.code).toBe('NETWORK_ERROR')
    expect(normalized.retryable).toBe(true)
  })

  it('maps socket hang up TypeError to NETWORK_ERROR', () => {
    const normalized = normalizeAnyError(new TypeError('socket hang up'))
    expect(normalized.code).toBe('NETWORK_ERROR')
    expect(normalized.retryable).toBe(true)
  })

  it('maps wrapped terminated message to NETWORK_ERROR', () => {
    const normalized = normalizeAnyError(new Error('exception TypeError: terminated'))
    expect(normalized.code).toBe('NETWORK_ERROR')
    expect(normalized.retryable).toBe(true)
  })
})

describe('normalizeAnyError provider-specific mapping', () => {
  it('maps Ark ModelNotOpen payload to MODEL_NOT_OPEN', () => {
    const normalized = normalizeAnyError({
      status: 404,
      code: 'ModelNotOpen',
      message: 'Your account has not activated the model doubao-seedream. Please activate the model service in the Ark Console.',
    })
    expect(normalized.code).toBe('MODEL_NOT_OPEN')
    expect(normalized.retryable).toBe(false)
  })

  it('maps Gemini empty response payload to EMPTY_RESPONSE even when status is 429', () => {
    const normalized = normalizeAnyError({
      status: 429,
      message: 'received empty response from Gemini: no meaningful content in candidates (code: channel:empty_response)',
    })
    expect(normalized.code).toBe('EMPTY_RESPONSE')
    expect(normalized.retryable).toBe(true)
  })

  it('maps template status 500 message to EXTERNAL_ERROR instead of INTERNAL_ERROR', () => {
    const normalized = normalizeAnyError(new Error('Template request failed with status 500: upstream overloaded'))
    expect(normalized.code).toBe('EXTERNAL_ERROR')
    expect(normalized.retryable).toBe(true)
  })

  it('maps openai-compatible video template mismatch to VIDEO_API_FORMAT_UNSUPPORTED', () => {
    const normalized = normalizeAnyError(
      new Error('VIDEO_API_FORMAT_UNSUPPORTED: OPENAI_COMPAT_VIDEO_TEMPLATE_TASK_ID_NOT_FOUND'),
    )
    expect(normalized.code).toBe('VIDEO_API_FORMAT_UNSUPPORTED')
    expect(normalized.retryable).toBe(false)
  })

  it('maps template status 415 message to VIDEO_API_FORMAT_UNSUPPORTED', () => {
    const normalized = normalizeAnyError(
      new Error('Template request failed with status 415: unsupported media type'),
    )
    expect(normalized.code).toBe('VIDEO_API_FORMAT_UNSUPPORTED')
    expect(normalized.retryable).toBe(false)
  })
})
