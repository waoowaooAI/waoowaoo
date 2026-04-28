import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { queryFalStatus, submitFalTask } from '@/lib/ai-providers/fal/queue'
import { startScenarioServer } from '../../helpers/fakes/scenario-server'

describe('provider contract - fal queue', () => {
  let server: Awaited<ReturnType<typeof startScenarioServer>> | null = null

  beforeEach(async () => {
    server = await startScenarioServer()
    process.env.FAL_QUEUE_BASE_URL = `${server.baseUrl}/fal`
  })

  afterEach(async () => {
    delete process.env.FAL_QUEUE_BASE_URL
    await server?.close()
    server = null
  })

  it('submits the expected auth header and json payload', async () => {
    server!.defineScenario({
      method: 'POST',
      path: '/fal/fal-ai/nano-banana-pro',
      mode: 'success',
      submitResponse: {
        status: 200,
        body: { request_id: 'req_image_1' },
      },
    })

    const requestId = await submitFalTask(
      'fal-ai/nano-banana-pro',
      {
        prompt: 'generate image',
        image_urls: ['data:image/png;base64,AAAA'],
      },
      'fal-key-1',
    )

    expect(requestId).toBe('req_image_1')
    const requests = server!.getRequests('POST', '/fal/fal-ai/nano-banana-pro')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.headers.authorization).toBe('Key fal-key-1')
    expect(JSON.parse(requests[0]?.bodyText || '{}')).toEqual({
      prompt: 'generate image',
      image_urls: ['data:image/png;base64,AAAA'],
    })
  })

  it('treats transient status failure as pending and completes after retry', async () => {
    server!.defineScenario({
      method: 'GET',
      path: '/fal/fal-ai/veo3.1/requests/req_video_1/status',
      mode: 'retryable_error_then_success',
      pollSequence: [
        { status: 503, body: { error: 'upstream unavailable' } },
        { status: 200, body: { status: 'COMPLETED' } },
      ],
    })
    server!.defineScenario({
      method: 'GET',
      path: '/fal/fal-ai/veo3.1/fast/image-to-video/requests/req_video_1',
      mode: 'success',
      submitResponse: {
        status: 200,
        body: {
          video: { url: 'https://cdn.local/video.mp4' },
        },
      },
    })

    const first = await queryFalStatus('fal-ai/veo3.1/fast/image-to-video', 'req_video_1', 'fal-key-2')
    const second = await queryFalStatus('fal-ai/veo3.1/fast/image-to-video', 'req_video_1', 'fal-key-2')

    expect(first).toEqual({
      status: 'IN_PROGRESS',
      completed: false,
      failed: false,
    })
    expect(second).toEqual({
      status: 'COMPLETED',
      completed: true,
      failed: false,
      resultUrl: 'https://cdn.local/video.mp4',
    })
  })

  it('marks a failed status response as failed with explicit provider error', async () => {
    server!.defineScenario({
      method: 'GET',
      path: '/fal/fal-ai/veo3.1/requests/req_failed/status',
      mode: 'fatal_error',
      submitResponse: {
        status: 200,
        body: {
          status: 'FAILED',
          error: 'content moderation failed',
        },
      },
    })

    const result = await queryFalStatus('fal-ai/veo3.1/fast/image-to-video', 'req_failed', 'fal-key-3')
    expect(result).toEqual({
      status: 'FAILED',
      completed: false,
      failed: true,
      error: 'content moderation failed',
    })
  })

  it('fails explicitly when submit response is malformed', async () => {
    server!.defineScenario({
      method: 'POST',
      path: '/fal/fal-ai/nano-banana-pro',
      mode: 'malformed_response',
      submitResponse: {
        status: 200,
        body: { ok: true },
      },
    })

    await expect(
      submitFalTask('fal-ai/nano-banana-pro', { prompt: 'bad response' }, 'fal-key-4'),
    ).rejects.toThrow('FAL未返回request_id')
  })

  it('treats completed result without media url as failed', async () => {
    server!.defineScenario({
      method: 'GET',
      path: '/fal/fal-ai/nano-banana-pro/requests/req_no_media/status',
      mode: 'queued_then_success',
      submitResponse: {
        status: 200,
        body: { status: 'COMPLETED' },
      },
    })
    server!.defineScenario({
      method: 'GET',
      path: '/fal/fal-ai/nano-banana-pro/requests/req_no_media',
      mode: 'malformed_response',
      submitResponse: {
        status: 200,
        body: { images: [] },
      },
    })

    const result = await queryFalStatus('fal-ai/nano-banana-pro', 'req_no_media', 'fal-key-5')
    expect(result).toEqual({
      status: 'COMPLETED',
      completed: true,
      failed: true,
      error: 'FAL任务完成但未返回媒体URL',
    })
  })
})
