import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { AUTH_REGISTER_RESULT_CODES } from '@/lib/auth/register-result-codes'

const rateLimitMock = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  getClientIp: vi.fn(),
  AUTH_REGISTER_LIMIT: { points: 1, durationSeconds: 60 },
}))

const operationAdapterMock = vi.hoisted(() => ({
  executeProjectAgentOperationFromApi: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => rateLimitMock)
vi.mock('@/lib/adapters/api/execute-project-agent-operation', () => operationAdapterMock)
vi.mock('@/lib/logging/semantic', () => ({ logAuthAction: vi.fn() }))

import { POST } from '@/app/api/auth/register/route'

function buildRequest(body: string): NextRequest {
  return new NextRequest('http://localhost/api/auth/register', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
    },
  })
}

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rateLimitMock.getClientIp.mockReturnValue('127.0.0.1')
    rateLimitMock.checkRateLimit.mockResolvedValue({ limited: false })
    operationAdapterMock.executeProjectAgentOperationFromApi.mockResolvedValue({
      message: AUTH_REGISTER_RESULT_CODES.success,
      user: { id: 'user-1', name: 'alice' },
    })
  })

  it('[invalid JSON] -> returns stable auth register code for client i18n', async () => {
    const response = await POST(buildRequest('{'), { params: Promise.resolve({}) })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('INVALID_PARAMS')
    expect(body.error.details.code).toBe(AUTH_REGISTER_RESULT_CODES.bodyParseFailed)
    expect(body.error.message).toBe(AUTH_REGISTER_RESULT_CODES.bodyParseFailed)
    expect(body.message).toBe(AUTH_REGISTER_RESULT_CODES.bodyParseFailed)
    expect(operationAdapterMock.executeProjectAgentOperationFromApi.mock.calls).toEqual([])
  })

  it('[rate limited] -> returns stable auth rate-limit code for client i18n', async () => {
    rateLimitMock.checkRateLimit.mockResolvedValue({ limited: true, retryAfterSeconds: 17 })

    const response = await POST(buildRequest('{}'), { params: Promise.resolve({}) })
    const body = await response.json()

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('17')
    expect(body).toEqual({
      success: false,
      code: AUTH_REGISTER_RESULT_CODES.rateLimited,
      message: AUTH_REGISTER_RESULT_CODES.rateLimited,
      retryAfterSeconds: 17,
    })
    expect(operationAdapterMock.executeProjectAgentOperationFromApi.mock.calls).toEqual([])
  })
})
