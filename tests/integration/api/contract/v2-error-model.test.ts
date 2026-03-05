import { describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

vi.mock('@/lib/api-auth', () => ({
  isErrorResponse: (value: unknown) => value instanceof Response,
  requireUserAuth: async () => ({ session: { user: { id: 'user-1' } } }),
}))

describe('api contract - v2 error model', () => {
  it('POST /api/v2/projects invalid body returns unified error fields', async () => {
    const { POST } = await import('@/app/api/v2/projects/route')
    const req = buildMockRequest({
      path: '/api/v2/projects',
      method: 'POST',
      body: [],
    })

    const res = await POST(req)
    expect(res.status).toBe(400)

    const payload = await res.json() as {
      success: boolean
      request_id?: string
      error?: {
        code?: string
        message?: string
        request_id?: string
        details?: Record<string, unknown>
      }
      code?: string
      message?: string
      details?: Record<string, unknown>
    }

    expect(payload.success).toBe(false)
    expect(payload.error?.code).toBe('INVALID_PARAMS')
    expect(typeof payload.error?.message).toBe('string')
    expect(typeof payload.error?.request_id).toBe('string')
    expect(payload.error?.details).toBeTruthy()
    expect(payload.error?.details?.request_id).toBe(payload.error?.request_id)

    expect(payload.code).toBe('INVALID_PARAMS')
    expect(typeof payload.message).toBe('string')
    expect(payload.request_id).toBe(payload.error?.request_id)
    expect(payload.details?.request_id).toBe(payload.error?.request_id)
  })
})
