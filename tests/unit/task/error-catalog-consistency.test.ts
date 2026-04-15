import { describe, expect, it } from 'vitest'
import { ERROR_CATALOG, ERROR_CATEGORY, getErrorSpec } from '@/lib/errors/codes'

describe('error catalog consistency', () => {
  it('keeps every catalog entry self-consistent and reachable through getErrorSpec', () => {
    const seenMessageKeys = new Set<string>()

    for (const [code, spec] of Object.entries(ERROR_CATALOG)) {
      expect(getErrorSpec(code as keyof typeof ERROR_CATALOG)).toEqual(spec)
      expect(spec.defaultMessage.trim().length).toBeGreaterThan(0)
      expect(spec.userMessageKey.trim().length).toBeGreaterThan(0)
      expect(spec.httpStatus).toBeGreaterThanOrEqual(200)
      expect(spec.httpStatus).toBeLessThan(600)
      expect(Object.values(ERROR_CATEGORY)).toContain(spec.category)
      expect(seenMessageKeys.has(spec.userMessageKey)).toBe(false)
      seenMessageKeys.add(spec.userMessageKey)
    }
  })

  it('keeps retryable provider/system errors out of 4xx except 429 and 202', () => {
    for (const spec of Object.values(ERROR_CATALOG)) {
      if (!spec.retryable) continue
      if (spec.httpStatus >= 500) continue
      expect([202, 429]).toContain(spec.httpStatus)
    }
  })
})
