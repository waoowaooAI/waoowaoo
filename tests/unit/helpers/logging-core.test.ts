import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('logging core suppression', () => {
  let originalLogLevel: string | undefined
  let originalUnifiedEnabled: string | undefined

  beforeEach(() => {
    vi.resetModules()
    originalLogLevel = process.env.LOG_LEVEL
    originalUnifiedEnabled = process.env.LOG_UNIFIED_ENABLED
    process.env.LOG_LEVEL = 'INFO'
    process.env.LOG_UNIFIED_ENABLED = 'true'
  })

  afterEach(() => {
    if (originalLogLevel === undefined) {
      delete process.env.LOG_LEVEL
    } else {
      process.env.LOG_LEVEL = originalLogLevel
    }
    if (originalUnifiedEnabled === undefined) {
      delete process.env.LOG_UNIFIED_ENABLED
    } else {
      process.env.LOG_UNIFIED_ENABLED = originalUnifiedEnabled
    }
    vi.restoreAllMocks()
  })

  it('suppresses worker.progress.stream logs', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { createScopedLogger } = await import('@/lib/logging/core')
    const logger = createScopedLogger({ module: 'worker.waoowaoo-text' })

    logger.info({
      action: 'worker.progress.stream',
      message: 'worker stream chunk',
      details: {
        kind: 'text',
        seq: 1,
      },
    })

    expect(consoleLogSpy).not.toHaveBeenCalled()
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('keeps non-suppressed logs', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const { createScopedLogger } = await import('@/lib/logging/core')
    const logger = createScopedLogger({ module: 'worker.waoowaoo-text' })

    logger.info({
      action: 'worker.progress',
      message: 'worker progress update',
    })

    expect(consoleLogSpy).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(String(consoleLogSpy.mock.calls[0]?.[0])) as { action?: string; message?: string }
    expect(payload.action).toBe('worker.progress')
    expect(payload.message).toBe('worker progress update')
  })
})
