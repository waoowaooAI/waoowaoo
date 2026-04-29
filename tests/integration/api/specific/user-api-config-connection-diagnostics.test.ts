import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { buildMockRequest } from '../../../helpers/request'
import {
  installAuthMocks,
  mockAuthenticated,
  resetAuthMockState,
} from '../../../helpers/auth'

const testLlmConnectionMock = vi.hoisted(() => vi.fn())
const testProviderConnectionMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/ai-exec/llm-test-connection', () => ({
  testLlmConnection: testLlmConnectionMock,
}))

vi.mock('@/lib/ai-exec/provider-test', () => ({
  testProviderConnection: testProviderConnectionMock,
}))

vi.mock('@/lib/user-api/model-template', () => ({
  validateOpenAICompatMediaTemplate: vi.fn(() => ({ ok: false, template: null, issues: [] })),
}))

vi.mock('@/lib/ai-exec/media-template-probe', () => ({
  probeMediaTemplate: vi.fn(),
}))

vi.mock('@/lib/ai-exec/llm-protocol-probe', () => ({
  probeModelLlmProtocol: vi.fn(),
}))

describe('api specific - user api-config connection diagnostics routes', () => {
  const routeContext = { params: Promise.resolve({}) }

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    resetAuthMockState()
    installAuthMocks()
    mockAuthenticated('user-1')
  })

  it('POST /api/user/api-config/test-connection: returns latencyMs and delegates payload', async () => {
    testLlmConnectionMock.mockResolvedValueOnce({
      provider: 'openai',
      message: 'ok',
    })

    const route = await import('@/app/api/user/api-config/test-connection/route')
    const req = buildMockRequest({
      path: '/api/user/api-config/test-connection',
      method: 'POST',
      body: { provider: 'openai', apiKey: 'sk-test' },
    })

    const res = await route.POST(req, routeContext)
    expect(res.status).toBe(200)
    const body = await res.json() as { success: boolean; latencyMs: number; provider: string }
    expect(body.success).toBe(true)
    expect(body.latencyMs).toEqual(expect.any(Number))
    expect(body.provider).toBe('openai')
    expect(testLlmConnectionMock).toHaveBeenCalledWith({ provider: 'openai', apiKey: 'sk-test' })
  })

  it('POST /api/user/api-config/test-connection: invalid JSON body -> 400', async () => {
    const route = await import('@/app/api/user/api-config/test-connection/route')
    const req = new NextRequest(new URL('http://localhost:3000/api/user/api-config/test-connection'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    })

    const res = await route.POST(req, routeContext)
    expect(res.status).toBe(400)
    const body = await res.json() as { error?: { code?: string } }
    expect(body.error?.code).toBe('INVALID_PARAMS')
  })

  it('POST /api/user/api-config/test-provider: returns steps and latencyMs', async () => {
    testProviderConnectionMock.mockResolvedValueOnce({
      success: true,
      steps: [{ name: 'models', status: 'pass', message: 'ok' }],
    })

    const route = await import('@/app/api/user/api-config/test-provider/route')
    const req = buildMockRequest({
      path: '/api/user/api-config/test-provider',
      method: 'POST',
      body: { apiType: 'openai-compatible', apiKey: 'sk-test', baseUrl: 'http://example.com' },
    })

    const res = await route.POST(req, routeContext)
    expect(res.status).toBe(200)
    const body = await res.json() as { success: boolean; steps: unknown[]; latencyMs: number }
    expect(body.success).toBe(true)
    expect(body.steps).toHaveLength(1)
    expect(body.latencyMs).toEqual(expect.any(Number))
  })

  it('POST /api/user/api-config/test-provider: invalid JSON body -> 400', async () => {
    const route = await import('@/app/api/user/api-config/test-provider/route')
    const req = new NextRequest(new URL('http://localhost:3000/api/user/api-config/test-provider'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    })

    const res = await route.POST(req, routeContext)
    expect(res.status).toBe(400)
    const body = await res.json() as { error?: { code?: string } }
    expect(body.error?.code).toBe('INVALID_PARAMS')
  })
})

