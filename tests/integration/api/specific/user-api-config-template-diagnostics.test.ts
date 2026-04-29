import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import {
  installAuthMocks,
  mockAuthenticated,
  resetAuthMockState,
} from '../../../helpers/auth'
import type { OpenAICompatMediaTemplate } from '@/lib/ai-registry/openai-compatible-template'

const validateTemplateMock = vi.hoisted(() => vi.fn())
const probeMediaTemplateMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/user-api/model-template', () => ({
  validateOpenAICompatMediaTemplate: validateTemplateMock,
}))

vi.mock('@/lib/ai-exec/media-template-probe', () => ({
  probeMediaTemplate: probeMediaTemplateMock,
}))

vi.mock('@/lib/ai-exec/llm-protocol-probe', () => ({
  probeModelLlmProtocol: vi.fn(),
}))

vi.mock('@/lib/ai-exec/llm-test-connection', () => ({
  testLlmConnection: vi.fn(),
}))

vi.mock('@/lib/ai-exec/provider-test', () => ({
  testProviderConnection: vi.fn(),
}))

describe('api specific - user api-config template diagnostics routes', () => {
  const routeContext = { params: Promise.resolve({}) }

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    validateTemplateMock.mockReset()
    probeMediaTemplateMock.mockReset()
    validateTemplateMock.mockReturnValue({ ok: false, template: null, issues: [] })
    resetAuthMockState()
    installAuthMocks()
    mockAuthenticated('user-1')
  })

  it('POST /api/user/api-config/assistant/validate-media-template: returns parsed template when valid', async () => {
    const template: OpenAICompatMediaTemplate = {
      version: 1,
      mediaType: 'image',
      mode: 'sync',
      create: { method: 'POST', path: '/v1/images/generations' },
      response: { outputUrlPath: '$.data[0].url' },
    }
    validateTemplateMock.mockReturnValue({ ok: true, template, issues: [] })

    const route = await import('@/app/api/user/api-config/assistant/validate-media-template/route')
    const req = buildMockRequest({
      path: '/api/user/api-config/assistant/validate-media-template',
      method: 'POST',
      body: {
        providerId: 'openai-compatible:node-1',
        template,
      },
    })

    const res = await route.POST(req, routeContext)
    expect(res.status).toBe(200)
    const body = await res.json() as { success: boolean; template?: unknown }
    expect(body.success).toBe(true)
    expect(body.template).toBeTruthy()
  })

  it('POST /api/user/api-config/assistant/validate-media-template: rejects non-openai-compatible provider', async () => {
    validateTemplateMock.mockReturnValue({ ok: true, template: null, issues: [] })

    const route = await import('@/app/api/user/api-config/assistant/validate-media-template/route')
    const req = buildMockRequest({
      path: '/api/user/api-config/assistant/validate-media-template',
      method: 'POST',
      body: {
        providerId: 'gemini-compatible:node-1',
        template: {},
      },
    })

    const res = await route.POST(req, routeContext)
    expect(res.status).toBe(400)
  })

  it('POST /api/user/api-config/assistant/probe-media-template: returns invalid template result without probing', async () => {
    validateTemplateMock.mockReturnValue({ ok: false, template: null, issues: [{ path: 'create.path', message: 'missing' }] })

    const route = await import('@/app/api/user/api-config/assistant/probe-media-template/route')
    const req = buildMockRequest({
      path: '/api/user/api-config/assistant/probe-media-template',
      method: 'POST',
      body: {
        providerId: 'openai-compatible:node-1',
        modelId: 'gpt-4.1-mini',
        template: {},
      },
    })

    const res = await route.POST(req, routeContext)
    expect(res.status).toBe(200)
    const body = await res.json() as { success: boolean; verified?: boolean; code?: string }
    expect(body.success).toBe(false)
    expect(body.verified).toBe(false)
    expect(body.code).toBe('MODEL_TEMPLATE_INVALID')
    expect(probeMediaTemplateMock).not.toHaveBeenCalled()
  })

  it('POST /api/user/api-config/assistant/probe-media-template: probes when template is valid', async () => {
    const template: OpenAICompatMediaTemplate = {
      version: 1,
      mediaType: 'image',
      mode: 'sync',
      create: { method: 'POST', path: '/v1/images/generations' },
      response: { outputUrlPath: '$.data[0].url' },
    }
    validateTemplateMock.mockReturnValue({ ok: true, template, issues: [] })
    probeMediaTemplateMock.mockResolvedValueOnce({
      success: true,
      verified: true,
      checkedAt: '2026-04-20T00:00:00.000Z',
      traces: [],
    })

    const route = await import('@/app/api/user/api-config/assistant/probe-media-template/route')
    const req = buildMockRequest({
      path: '/api/user/api-config/assistant/probe-media-template',
      method: 'POST',
      body: {
        providerId: 'openai-compatible:node-1',
        modelId: 'gpt-4.1-mini',
        template,
        samplePrompt: 'hello',
      },
    })

    const res = await route.POST(req, routeContext)
    expect(res.status).toBe(200)
    const body = await res.json() as { success: boolean; verified: boolean }
    expect(body.success).toBe(true)
    expect(body.verified).toBe(true)
    expect(probeMediaTemplateMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      providerId: 'openai-compatible:node-1',
      modelId: 'gpt-4.1-mini',
      template,
      samplePrompt: 'hello',
    }))
  })
})
