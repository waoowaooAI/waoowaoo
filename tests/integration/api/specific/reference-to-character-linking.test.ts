import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import {
  installAuthMocks,
  mockAuthenticated,
  mockUnauthenticated,
  resetAuthMockState,
} from '../../../helpers/auth'

describe('api specific - reference to character route', () => {
  beforeEach(() => {
    vi.resetModules()
    resetAuthMockState()
  })

  it('returns unauthorized when user is not authenticated', async () => {
    installAuthMocks()
    mockUnauthenticated()
    const mod = await import('@/app/api/asset-hub/reference-to-character/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/reference-to-character',
      method: 'POST',
      body: {
        referenceImageUrl: 'https://example.com/ref.png',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(401)
  })

  it('returns invalid params when references are missing', async () => {
    installAuthMocks()
    mockAuthenticated('user-a')
    const mod = await import('@/app/api/asset-hub/reference-to-character/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/reference-to-character',
      method: 'POST',
      body: {},
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVALID_PARAMS')
  })
})
