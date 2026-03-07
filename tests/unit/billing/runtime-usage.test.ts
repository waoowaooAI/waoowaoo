import { AsyncLocalStorage } from 'node:async_hooks'
import { describe, expect, it, vi } from 'vitest'
import { recordTextUsage, withTextUsageCollection } from '@/lib/billing/runtime-usage'

describe('billing/runtime-usage', () => {
  it('ignores records outside of collection scope', () => {
    expect(() => {
      recordTextUsage({
        model: 'm',
        inputTokens: 10,
        outputTokens: 20,
      })
    }).not.toThrow()
  })

  it('collects and normalizes token usage', async () => {
    const { textUsage } = await withTextUsageCollection(async () => {
      recordTextUsage({
        model: 'test-model',
        inputTokens: 10.9,
        outputTokens: -2,
      })
      return { ok: true }
    })

    expect(textUsage).toEqual([
      {
        model: 'test-model',
        inputTokens: 10,
        outputTokens: 0,
      },
    ])
  })

  it('falls back to empty usage when store is unavailable at read time', async () => {
    const getStoreSpy = vi.spyOn(AsyncLocalStorage.prototype, 'getStore')
    getStoreSpy.mockReturnValueOnce(undefined as never)

    const payload = await withTextUsageCollection(async () => ({ ok: true }))

    expect(payload).toEqual({ result: { ok: true }, textUsage: [] })
    getStoreSpy.mockRestore()
  })

  it('normalizes NaN and zero token values to zero', async () => {
    const { textUsage } = await withTextUsageCollection(async () => {
      recordTextUsage({
        model: 'nan-model',
        inputTokens: Number.NaN,
        outputTokens: 0,
      })
      return { ok: true }
    })

    expect(textUsage).toEqual([
      {
        model: 'nan-model',
        inputTokens: 0,
        outputTokens: 0,
      },
    ])
  })

  it('isolates concurrent async local storage contexts', async () => {
    const [left, right] = await Promise.all([
      withTextUsageCollection(async () => {
        recordTextUsage({ model: 'left', inputTokens: 1, outputTokens: 2 })
        return 'left'
      }),
      withTextUsageCollection(async () => {
        recordTextUsage({ model: 'right', inputTokens: 3, outputTokens: 4 })
        return 'right'
      }),
    ])

    expect(left.textUsage).toEqual([{ model: 'left', inputTokens: 1, outputTokens: 2 }])
    expect(right.textUsage).toEqual([{ model: 'right', inputTokens: 3, outputTokens: 4 }])
  })
})
