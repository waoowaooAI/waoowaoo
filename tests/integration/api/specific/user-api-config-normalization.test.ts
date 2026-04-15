import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import {
  installAuthMocks,
  mockAuthenticated,
  resetAuthMockState,
} from '../../../helpers/auth'
import {
  prismaMock,
  readSavedModelsFromUpsert,
  readSavedProvidersFromUpsert,
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
  getBillingMode: vi.fn(async () => 'OFF'),
}))

describe('api specific - user api-config normalization', () => {
  beforeEach(() => {
    resetAuthMockState()
    resetUserApiConfigMocks()
  })

  it('allows multiple providers with the same api type when provider ids differ', async () => {
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
          { id: 'gemini-compatible:gm-1', name: 'Gemini A', baseUrl: 'https://gm-a.test', apiKey: 'gm-key-a' },
          { id: 'gemini-compatible:gm-2', name: 'Gemini B', baseUrl: 'https://gm-b.test', apiKey: 'gm-key-b' },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)
    expect(prismaMock.userPreference.upsert).toHaveBeenCalledTimes(1)

    const savedProviders = readSavedProvidersFromUpsert()
    expect(savedProviders.map((provider) => provider.id)).toEqual([
      'openai-compatible:oa-1',
      'openai-compatible:oa-2',
      'gemini-compatible:gm-1',
      'gemini-compatible:gm-2',
    ])
  })

  it('regression: preserves reordered providers array order when persisting', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'google', name: 'Google AI Studio', apiKey: 'google-key' },
          { id: 'ark', name: 'Volcengine Ark', apiKey: 'ark-key' },
          { id: 'openai-compatible:oa-2', name: 'OpenAI B', baseUrl: 'https://oa-b.test', apiKey: 'oa-key-b' },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)

    const savedProviders = readSavedProvidersFromUpsert()
    expect(savedProviders.map((provider) => provider.id)).toEqual([
      'google',
      'ark',
      'openai-compatible:oa-2',
    ])
  })

  it('persists provider hidden flag', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'google', name: 'Google AI Studio', apiKey: 'google-key', hidden: true },
          { id: 'ark', name: 'Volcengine Ark', apiKey: 'ark-key', hidden: false },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)

    const savedProviders = readSavedProvidersFromUpsert()
    const googleProvider = savedProviders.find((provider) => provider.id === 'google')
    const arkProvider = savedProviders.find((provider) => provider.id === 'ark')
    expect(googleProvider?.hidden).toBe(true)
    expect(arkProvider?.hidden).toBe(false)
  })

  it('pins minimax provider baseUrl to official endpoint when baseUrl is omitted', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'minimax', name: 'MiniMax Hailuo', apiKey: 'mm-key' },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)

    const savedProviders = readSavedProvidersFromUpsert()
    expect(savedProviders[0]).toMatchObject({
      id: 'minimax',
      baseUrl: 'https://api.minimaxi.com/v1',
    })
  })

  it('keeps new provider apiKey empty instead of reusing another same-type provider apiKey', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    prismaMock.userPreference.findUnique.mockResolvedValue({
      customProviders: JSON.stringify([
        {
          id: 'openai-compatible:old',
          name: 'Old',
          baseUrl: 'https://old.test',
          apiKey: 'enc:legacy',
        },
      ]),
      customModels: null,
    })
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'openai-compatible:old', name: 'Old', baseUrl: 'https://old.test' },
          { id: 'openai-compatible:new', name: 'New', baseUrl: 'https://new.test' },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)

    const savedProviders = readSavedProvidersFromUpsert()
    const oldProvider = savedProviders.find((provider) => provider.id === 'openai-compatible:old')
    const newProvider = savedProviders.find((provider) => provider.id === 'openai-compatible:new')

    expect(oldProvider?.apiKey).toBe('enc:legacy')
    expect(newProvider).toBeDefined()
    expect(Object.prototype.hasOwnProperty.call(newProvider as object, 'apiKey')).toBe(false)
  })

  it('accepts openai-compatible provider image/video models', async () => {
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
            apiMode: 'openai-official',
          },
        ],
        models: [
          {
            type: 'image',
            provider: 'openai-compatible:oa-1',
            modelId: 'gpt-image-1',
            modelKey: 'openai-compatible:oa-1::gpt-image-1',
            name: 'Image Model',
          },
          {
            type: 'video',
            provider: 'openai-compatible:oa-1',
            modelId: 'sora-2',
            modelKey: 'openai-compatible:oa-1::sora-2',
            name: 'Video Model',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)
  })

  it('persists llmProtocol for openai-compatible llm models', async () => {
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
            llmProtocol: 'responses',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)

    const savedModels = readSavedModelsFromUpsert()
    expect(savedModels[0]?.llmProtocol).toBe('responses')
    expect(typeof savedModels[0]?.llmProtocolCheckedAt).toBe('string')
  })

  it('backfills historical openai-compatible llm models missing llmProtocol during PUT', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    prismaMock.userPreference.findUnique.mockResolvedValue({
      customProviders: JSON.stringify([
        { id: 'openai-compatible:oa-1', name: 'OpenAI Node', baseUrl: 'https://oa.test/v1', apiKey: 'enc:oa-key' },
      ]),
      customModels: JSON.stringify([
        {
          type: 'llm',
          provider: 'openai-compatible:oa-1',
          modelId: 'gpt-4.1-mini',
          modelKey: 'openai-compatible:oa-1::gpt-4.1-mini',
          name: 'GPT 4.1 Mini',
        },
      ]),
    })
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'openai-compatible:oa-1', name: 'OpenAI Node', baseUrl: 'https://oa.test/v1' },
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
    expect(res.status).toBe(200)

    const savedModels = readSavedModelsFromUpsert()
    expect(savedModels[0]?.llmProtocol).toBe('chat-completions')
    expect(typeof savedModels[0]?.llmProtocolCheckedAt).toBe('string')
  })

  it('defaults gemini-compatible provider to official route when apiMode is gemini-sdk', async () => {
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
            name: 'Gemini Official Mode',
            baseUrl: 'https://gm.test',
            apiKey: 'gm-key',
            apiMode: 'gemini-sdk',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)

    const savedProviders = readSavedProvidersFromUpsert()
    expect(savedProviders[0]?.gatewayRoute).toBe('official')
    expect(savedProviders[0]?.apiMode).toBe('gemini-sdk')
  })

  it('forces openai-compatible provider to openai-compat route', async () => {
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
            apiMode: 'openai-official',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)

    const savedProviders = readSavedProvidersFromUpsert()
    expect(savedProviders[0]?.gatewayRoute).toBe('openai-compat')
  })

  it('bailian provider always persists gatewayRoute as official', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          {
            id: 'bailian',
            name: 'Alibaba Bailian',
            apiKey: 'bl-key',
            gatewayRoute: 'official',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)
    const savedProviders = readSavedProvidersFromUpsert()
    expect(savedProviders[0]?.gatewayRoute).toBe('official')
  })

  it('backfills default compatMediaTemplate for openai-compatible image model when missing', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'openai-compatible:oa-1', name: 'OpenAI Compat', baseUrl: 'https://compat.test/v1', apiKey: 'oa-key' },
        ],
        models: [
          {
            modelId: 'gpt-image-1',
            modelKey: 'openai-compatible:oa-1::gpt-image-1',
            name: 'Image One',
            type: 'image',
            provider: 'openai-compatible:oa-1',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)
    const savedModels = readSavedModelsFromUpsert()
    const savedModel = savedModels.find((item) => item.modelKey === 'openai-compatible:oa-1::gpt-image-1')
    expect(savedModel?.compatMediaTemplate).toMatchObject({
      version: 1,
      mediaType: 'image',
      mode: 'sync',
      create: {
        path: '/images/generations',
      },
    })
  })

  it('backfills default compatMediaTemplate for openai-compatible video model when missing', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'openai-compatible:oa-1', name: 'OpenAI Compat', baseUrl: 'https://compat.test/v1', apiKey: 'oa-key' },
        ],
        models: [
          {
            modelId: 'veo-2',
            modelKey: 'openai-compatible:oa-1::veo-2',
            name: 'Veo 2',
            type: 'video',
            provider: 'openai-compatible:oa-1',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)
    const savedModels = readSavedModelsFromUpsert()
    const savedModel = savedModels.find((item) => item.modelKey === 'openai-compatible:oa-1::veo-2')
    expect(savedModel?.compatMediaTemplate).toMatchObject({
      version: 1,
      mediaType: 'video',
      mode: 'async',
    })
  })

  it('keeps explicit compatMediaTemplate for openai-compatible video model', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    const route = await import('@/app/api/user/api-config/route')

    const req = buildMockRequest({
      path: '/api/user/api-config',
      method: 'PUT',
      body: {
        providers: [
          { id: 'openai-compatible:oa-1', name: 'OpenAI Compat', baseUrl: 'https://compat.test/v1', apiKey: 'oa-key' },
        ],
        models: [
          {
            modelId: 'veo3.1',
            modelKey: 'openai-compatible:oa-1::veo3.1',
            name: 'Veo 3.1',
            type: 'video',
            provider: 'openai-compatible:oa-1',
            compatMediaTemplate: {
              version: 1,
              mediaType: 'video',
              mode: 'async',
              create: {
                method: 'POST',
                path: '/v2/videos/generations',
                contentType: 'application/json',
                bodyTemplate: {
                  model: '{{model}}',
                  prompt: '{{prompt}}',
                },
              },
              status: {
                method: 'GET',
                path: '/v2/videos/generations/{{task_id}}',
              },
              response: {
                taskIdPath: '$.task_id',
                statusPath: '$.status',
                outputUrlPath: '$.video_url',
              },
              polling: {
                intervalMs: 3000,
                timeoutMs: 180000,
                doneStates: ['succeeded'],
                failStates: ['failed'],
              },
            },
            compatMediaTemplateSource: 'ai',
          },
        ],
      },
    })

    const res = await route.PUT(req, routeContext)
    expect(res.status).toBe(200)
    const savedModels = readSavedModelsFromUpsert()
    const savedModel = savedModels.find((item) => item.modelKey === 'openai-compatible:oa-1::veo3.1')
    expect(savedModel?.compatMediaTemplateSource).toBe('ai')
  })
})
