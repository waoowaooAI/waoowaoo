import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import {
  installAuthMocks,
  mockAuthenticated,
  resetAuthMockState,
} from '../../../helpers/auth'
import {
  getBillingModeMock,
  prismaMock,
  resetUserApiConfigMocks,
  routeContext,
} from '../helpers/user-api-config-contract'

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/crypto-utils', () => ({
  encryptApiKey: vi.fn((value: string) => `enc:${value}`),
  decryptApiKey: vi.fn((value: string) => value.replace(/^enc:/, '')),
}))

vi.mock('@/lib/billing/mode', () => ({
  getBillingMode: getBillingModeMock,
}))

describe('api specific - user api-config validation', () => {
  beforeEach(() => {
    resetAuthMockState()
    resetUserApiConfigMocks()
  })

  it('rejects non-boolean provider hidden flag', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'google', name: 'Google AI Studio', apiKey: 'google-key', hidden: 'yes' },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(400)
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('rejects minimax provider custom baseUrl', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'minimax', name: 'MiniMax Hailuo', baseUrl: 'https://custom.minimax.proxy/v1', apiKey: 'mm-key' },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(400)
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('rejects duplicated provider ids', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'openai-compatible:dup', name: 'Provider A', baseUrl: 'https://a.test', apiKey: 'key-a' },
          { id: 'openai-compatible:dup', name: 'Provider B', baseUrl: 'https://b.test', apiKey: 'key-b' },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(400)
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('rejects duplicated provider ids even when only case differs', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'OpenAI-Compatible:CaseDup', name: 'Provider A', baseUrl: 'https://a.test', apiKey: 'key-a' },
          { id: 'openai-compatible:casedup', name: 'Provider B', baseUrl: 'https://b.test', apiKey: 'key-b' },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(400)
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('requires explicit provider id on models when multiple same-type providers exist', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'openai-compatible:oa-1', name: 'OpenAI A', baseUrl: 'https://oa-a.test', apiKey: 'oa-key-a' },
          { id: 'openai-compatible:oa-2', name: 'OpenAI B', baseUrl: 'https://oa-b.test', apiKey: 'oa-key-b' },
        ],
        models: [
          {
            type: 'llm',
            provider: 'openai-compatible',
            modelId: 'gpt-4.1',
            modelKey: 'openai-compatible::gpt-4.1',
            name: 'GPT 4.1',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(400)
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('requires llmProtocol when adding a new openai-compatible llm model', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'openai-compatible:oa-1', name: 'OpenAI Node', baseUrl: 'https://oa.test/v1', apiKey: 'oa-key' },
        ],
        models: [
          {
            type: 'llm',
            provider: 'openai-compatible:oa-1',
            modelId: 'gpt-4.1-mini',
            modelKey: 'openai-compatible:oa-1::gpt-4.1-mini',
            name: 'GPT 4.1 Mini',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(400)
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('rejects llmProtocol on non-openai-compatible or non-llm models', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'gemini-compatible:gm-1', name: 'Gemini Compat', baseUrl: 'https://gm.test', apiKey: 'gm-key' },
        ],
        models: [
          {
            type: 'llm',
            provider: 'gemini-compatible:gm-1',
            modelId: 'gemini-3-pro-preview',
            modelKey: 'gemini-compatible:gm-1::gemini-3-pro-preview',
            name: 'Gemini 3 Pro',
            llmProtocol: 'chat-completions',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(400)
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('rejects invalid custom pricing structure', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'openai-compatible:oa-1', name: 'OpenAI Node', baseUrl: 'https://oa.test/v1', apiKey: 'oa-key' },
        ],
        models: [
          {
            type: 'image',
            provider: 'openai-compatible:oa-1',
            modelId: 'gpt-image-1',
            modelKey: 'openai-compatible:oa-1::gpt-image-1',
            name: 'Image Model',
            customPricing: {
              image: {
                basePrice: -1,
              },
            },
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(400)
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('rejects custom pricing option mappings with unsupported capability values', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'ark', name: 'Volcengine Ark', apiKey: 'ark-key' },
        ],
        models: [
          {
            type: 'video',
            provider: 'ark',
            modelId: 'doubao-seedance-1-0-pro-fast-251015',
            modelKey: 'ark::doubao-seedance-1-0-pro-fast-251015',
            name: 'Ark Video',
            customPricing: {
              video: {
                basePrice: 0.5,
                optionPrices: {
                  resolution: {
                    '2k': 1.2,
                  },
                },
              },
            },
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(400)
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('rejects gemini-compatible provider when apiMode is openai-official', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          {
            id: 'gemini-compatible:gm-1',
            name: 'Gemini OpenAI Mode',
            baseUrl: 'https://gm.test',
            apiKey: 'gm-key',
            apiMode: 'openai-official',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(400)
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('rejects legacy litellm gatewayRoute value', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          {
            id: 'openai-compatible:oa-1',
            name: 'OpenAI Node',
            baseUrl: 'https://oa.test/v1',
            apiKey: 'oa-key',
            gatewayRoute: 'litellm',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(400)
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('siliconflow provider rejects litellm gatewayRoute', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          {
            id: 'siliconflow',
            name: 'SiliconFlow',
            apiKey: 'sf-key',
            gatewayRoute: 'litellm',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(400)
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('rejects compatMediaTemplate on non-openai-compatible media model', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'google', name: 'Google AI Studio', apiKey: 'google-key' },
        ],
        models: [
          {
            modelId: 'veo-3.1-fast-generate-preview',
            modelKey: 'google::veo-3.1-fast-generate-preview',
            name: 'Veo Fast',
            type: 'video',
            provider: 'google',
            compatMediaTemplate: {
              version: 1,
              mediaType: 'video',
              mode: 'sync',
              create: { method: 'POST', path: '/videos' },
              response: { outputUrlPath: '$.url' },
            },
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(400)
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })

  it('migrated bailian provider id is accepted and qwen is rejected', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const acceptedReq = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'bailian', name: 'Alibaba Bailian', apiKey: 'bl-key' },
        ],
      },
    })
    const acceptedRes = await route.PUT(acceptedReq, routeContext)
    expect(acceptedRes.status).toBe(200)

    vi.clearAllMocks()
    prismaMock.userPreference.findUnique.mockResolvedValue({
      customProviders: null,
      customModels: null,
    })

    const rejectedReq = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'qwen', name: 'Qwen', apiKey: 'old-key' },
        ],
      },
    })
    const rejectedRes = await route.PUT(rejectedReq, routeContext)
    expect(rejectedRes.status).toBe(400)
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled()
  })
})
