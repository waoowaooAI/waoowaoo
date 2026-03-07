import { describe, expect, it } from 'vitest'
import { resolveTaskErrorMessage, resolveTaskErrorSummary } from '@/lib/task/error-message'

describe('task error message normalization', () => {
  it('maps TASK_CANCELLED to unified cancelled message', () => {
    const summary = resolveTaskErrorSummary({
      errorCode: 'TASK_CANCELLED',
      errorMessage: 'whatever',
    })
    expect(summary.cancelled).toBe(true)
    expect(summary.code).toBe('CONFLICT')
    expect(summary.message).toBe('Task cancelled by user')
  })

  it('keeps cancelled semantics from normalized task error details', () => {
    const summary = resolveTaskErrorSummary({
      error: {
        code: 'CONFLICT',
        message: 'Task cancelled by user',
        details: { cancelled: true, originalCode: 'TASK_CANCELLED' },
      },
    })
    expect(summary.cancelled).toBe(true)
    expect(summary.code).toBe('CONFLICT')
    expect(summary.message).toBe('Task cancelled by user')
  })

  it('extracts nested error message from payload', () => {
    const message = resolveTaskErrorMessage({
      error: {
        details: {
          message: 'provider failed',
        },
      },
    }, 'fallback')
    expect(message).toBe('provider failed')
  })

  it('supports flat error/details string payload', () => {
    expect(resolveTaskErrorMessage({
      error: 'provider failed',
    }, 'fallback')).toBe('provider failed')

    expect(resolveTaskErrorMessage({
      details: 'provider failed',
    }, 'fallback')).toBe('provider failed')
  })

  it('uses fallback when payload has no structured error', () => {
    expect(resolveTaskErrorMessage({}, 'fallback')).toBe('fallback')
  })

  it('recognizes cancelled semantics from message-only payload', () => {
    const summary = resolveTaskErrorSummary({
      message: 'Task cancelled by user',
    })
    expect(summary.cancelled).toBe(true)
    expect(summary.message).toBe('Task cancelled by user')
  })

  it('prefers user-friendly message for MODEL_NOT_OPEN', () => {
    const summary = resolveTaskErrorSummary({
      error: {
        code: 'MODEL_NOT_OPEN',
        message: 'raw provider message should not be shown',
      },
    })
    expect(summary.code).toBe('MODEL_NOT_OPEN')
    expect(summary.message).toContain('模型权限未开通')
    expect(summary.message).toContain('https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement?LLM=%7B%7D&advancedActiveKey=model')
  })

  it('prefers user-friendly message for EMPTY_RESPONSE', () => {
    const summary = resolveTaskErrorSummary({
      error: {
        code: 'EMPTY_RESPONSE',
        message: 'raw provider empty response',
      },
    })
    expect(summary.code).toBe('EMPTY_RESPONSE')
    expect(summary.message).toContain('模型返回空响应')
  })
})
