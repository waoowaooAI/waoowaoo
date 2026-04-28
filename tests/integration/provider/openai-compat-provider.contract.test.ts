import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateVideoViaOpenAICompatTemplate } from '@/lib/ai-providers/openai-compatible/user-template'
import { pollAsyncTask } from '@/lib/async-poll'
import { startScenarioServer } from '../../helpers/fakes/scenario-server'

const getProviderConfigMock = vi.hoisted(() => vi.fn())
const getUserModelsMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: getProviderConfigMock,
  getUserModels: getUserModelsMock,
}))

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

describe('provider contract - openai compatible media template', () => {
  let server: Awaited<ReturnType<typeof startScenarioServer>> | null = null

  beforeEach(async () => {
    server = await startScenarioServer()
    vi.clearAllMocks()
    getProviderConfigMock.mockResolvedValue({
      id: 'openai-compatible:provider-local',
      apiKey: 'sk-local',
      baseUrl: `${server.baseUrl}/compat/v1`,
    })
  })

  afterEach(async () => {
    await server?.close()
    server = null
  })

  it('renders create request against provider baseUrl and returns OCOMPAT externalId', async () => {
    server!.defineScenario({
      method: 'POST',
      path: '/compat/v1/video/create',
      mode: 'success',
      submitResponse: {
        status: 200,
        body: { status: 'queued', task_id: 'task_local_1' },
      },
    })

    const result = await generateVideoViaOpenAICompatTemplate({
      userId: 'user-local',
      providerId: 'openai-compatible:provider-local',
      modelId: 'veo-local',
      modelKey: 'openai-compatible:provider-local::veo-local',
      imageUrl: 'data:image/png;base64,AAAA',
      prompt: 'animate this frame',
      options: {
        duration: 5,
        aspectRatio: '9:16',
      },
      profile: 'openai-compatible',
      template: {
        version: 1,
        mediaType: 'video',
        mode: 'async',
        create: {
          method: 'POST',
          path: '/video/create',
          bodyTemplate: {
            model: '{{model}}',
            prompt: '{{prompt}}',
            image: '{{image}}',
            duration: '{{duration}}',
          },
        },
        status: { method: 'GET', path: '/video/status/{{task_id}}' },
        response: {
          taskIdPath: '$.task_id',
          statusPath: '$.status',
        },
        polling: {
          intervalMs: 1000,
          timeoutMs: 30_000,
          doneStates: ['done'],
          failStates: ['failed'],
        },
      },
    })

    expect(result).toMatchObject({
      success: true,
      async: true,
      requestId: 'task_local_1',
      externalId: `OCOMPAT:VIDEO:b64_${encode('openai-compatible:provider-local')}:${encode('veo-local')}:task_local_1`,
    })

    const requests = server!.getRequests('POST', '/compat/v1/video/create')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.headers.authorization).toBe('Bearer sk-local')
    expect(JSON.parse(requests[0]?.bodyText || '{}')).toEqual({
      model: 'veo-local',
      prompt: 'animate this frame',
      image: 'data:image/png;base64,AAAA',
      duration: 5,
    })
  })

  it('polls localhost provider status and falls back to content endpoint when output url is missing', async () => {
    getUserModelsMock.mockResolvedValue([
      {
        modelKey: 'openai-compatible:provider-local::veo-local',
        modelId: 'veo-local',
        name: 'Local Veo',
        type: 'video',
        provider: 'openai-compatible:provider-local',
        price: 0,
        compatMediaTemplate: {
          version: 1,
          mediaType: 'video',
          mode: 'async',
          create: { method: 'POST', path: '/video/create' },
          status: { method: 'GET', path: '/video/status/{{task_id}}' },
          content: { method: 'GET', path: '/video/content/{{task_id}}' },
          response: {
            statusPath: '$.status',
          },
          polling: {
            intervalMs: 1000,
            timeoutMs: 30_000,
            doneStates: ['done'],
            failStates: ['failed'],
          },
        },
      },
    ])
    server!.defineScenario({
      method: 'GET',
      path: '/compat/v1/video/status/task_local_2',
      mode: 'queued_then_success',
      pollSequence: [
        { status: 200, body: { status: 'running' } },
        { status: 200, body: { status: 'done' } },
      ],
    })

    const first = await pollAsyncTask(
      `OCOMPAT:VIDEO:${encode('openai-compatible:provider-local')}:${encode('openai-compatible:provider-local::veo-local')}:task_local_2`,
      'user-local',
    )
    const second = await pollAsyncTask(
      `OCOMPAT:VIDEO:${encode('openai-compatible:provider-local')}:${encode('openai-compatible:provider-local::veo-local')}:task_local_2`,
      'user-local',
    )

    expect(first).toEqual({ status: 'pending' })
    expect(second).toEqual({
      status: 'completed',
      resultUrl: `${server!.baseUrl}/compat/v1/video/content/task_local_2`,
      videoUrl: `${server!.baseUrl}/compat/v1/video/content/task_local_2`,
      downloadHeaders: {
        Authorization: 'Bearer sk-local',
      },
    })
  })

  it('fails explicitly when async create response omits task id', async () => {
    server!.defineScenario({
      method: 'POST',
      path: '/compat/v1/video/create',
      mode: 'malformed_response',
      submitResponse: {
        status: 200,
        body: { status: 'queued' },
      },
    })

    await expect(
      generateVideoViaOpenAICompatTemplate({
        userId: 'user-local',
        providerId: 'openai-compatible:provider-local',
        modelId: 'veo-local',
        modelKey: 'openai-compatible:provider-local::veo-local',
        imageUrl: 'data:image/png;base64,AAAA',
        prompt: 'bad create payload',
        profile: 'openai-compatible',
        template: {
          version: 1,
          mediaType: 'video',
          mode: 'async',
          create: {
            method: 'POST',
            path: '/video/create',
            bodyTemplate: { prompt: '{{prompt}}' },
          },
          status: { method: 'GET', path: '/video/status/{{task_id}}' },
          response: {
            taskIdPath: '$.task_id',
            statusPath: '$.status',
          },
          polling: {
            intervalMs: 1000,
            timeoutMs: 30_000,
            doneStates: ['done'],
            failStates: ['failed'],
          },
        },
      }),
    ).rejects.toThrow('OPENAI_COMPAT_VIDEO_TEMPLATE_TASK_ID_NOT_FOUND')
  })
})
