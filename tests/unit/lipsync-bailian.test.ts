import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const resolveModelSelectionOrSingleMock = vi.hoisted(() => vi.fn())
const getProviderConfigMock = vi.hoisted(() => vi.fn())
const getProviderKeyMock = vi.hoisted(() => vi.fn((providerId: string) => {
  const marker = providerId.indexOf(':')
  return marker === -1 ? providerId : providerId.slice(0, marker)
}))
const submitFalTaskMock = vi.hoisted(() => vi.fn())
const normalizeToOriginalMediaUrlMock = vi.hoisted(() => vi.fn(async (input: string) => {
  if (input.startsWith('/')) {
    return `http://localhost:3000${input}`
  }
  return input
}))

vi.mock('@/lib/api-config', () => ({
  resolveModelSelectionOrSingle: resolveModelSelectionOrSingleMock,
  getProviderConfig: getProviderConfigMock,
  getProviderKey: getProviderKeyMock,
}))

vi.mock('@/lib/async-submit', () => ({
  submitFalTask: submitFalTaskMock,
}))

vi.mock('@/lib/media/outbound-image', () => ({
  normalizeToBase64ForGeneration: vi.fn(async (input: string) => input),
  normalizeToOriginalMediaUrl: normalizeToOriginalMediaUrlMock,
}))

vi.mock('@/lib/logging/core', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  createScopedLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}))

import { generateLipSync } from '@/lib/lipsync'

const POLICY_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/uploads'
const SUBMIT_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image2video/video-synthesis'
const UPLOAD_HOST = 'https://upload.example.com'

function buildJsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({
      'content-type': 'application/json',
    }),
    text: async () => JSON.stringify(payload),
  } as unknown as Response
}

function buildBinaryResponse(contentType: string, data: string): Response {
  const bytes = new TextEncoder().encode(data)
  return {
    ok: true,
    status: 200,
    headers: new Headers({
      'content-type': contentType,
    }),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    text: async () => '',
  } as unknown as Response
}

describe('lip-sync bailian submit', () => {
  const originalNextauthUrl = process.env.NEXTAUTH_URL

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXTAUTH_URL = originalNextauthUrl
    resolveModelSelectionOrSingleMock.mockResolvedValue({
      provider: 'bailian',
      modelId: 'videoretalk',
      modelKey: 'bailian::videoretalk',
      mediaType: 'lipsync',
    })
    getProviderConfigMock.mockResolvedValue({
      id: 'bailian',
      apiKey: 'bl-key',
    })
  })

  afterAll(() => {
    process.env.NEXTAUTH_URL = originalNextauthUrl
  })

  it('uploads local media to bailian temp storage then submits oss urls', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith(`${POLICY_ENDPOINT}?action=getPolicy&model=videoretalk`)) {
        return buildJsonResponse({
          data: {
            upload_host: UPLOAD_HOST,
            upload_dir: 'dashscope-instant/upload-dir',
            oss_access_key_id: 'ak',
            policy: 'policy',
            signature: 'sig',
          },
        })
      }
      if (url === 'http://localhost:3000/api/storage/sign?key=images%2Fdemo.mp4') {
        return buildBinaryResponse('video/mp4', 'video-bytes')
      }
      if (url === 'http://localhost:3000/api/storage/sign?key=voice%2Fdemo.wav') {
        return buildBinaryResponse('audio/wav', 'audio-bytes')
      }
      if (url === UPLOAD_HOST) {
        return {
          ok: true,
          status: 200,
          text: async () => '',
        } as unknown as Response
      }
      if (url === SUBMIT_ENDPOINT) {
        return buildJsonResponse({
          output: {
            task_id: 'task-123',
            task_status: 'PENDING',
          },
        })
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await generateLipSync(
      {
        videoUrl: '/api/storage/sign?key=images%2Fdemo.mp4',
        audioUrl: '/api/storage/sign?key=voice%2Fdemo.wav',
        audioDurationMs: 3000,
        videoDurationMs: 5000,
      },
      'user-1',
      'bailian::videoretalk',
    )

    expect(resolveModelSelectionOrSingleMock).toHaveBeenCalledWith('user-1', 'bailian::videoretalk', 'lipsync')
    expect(getProviderConfigMock).toHaveBeenCalledWith('user-1', 'bailian')
    expect(normalizeToOriginalMediaUrlMock).toHaveBeenCalledWith('/api/storage/sign?key=images%2Fdemo.mp4')
    expect(normalizeToOriginalMediaUrlMock).toHaveBeenCalledWith('/api/storage/sign?key=voice%2Fdemo.wav')

    const submitCall = fetchMock.mock.calls.find(([input]) => String(input) === SUBMIT_ENDPOINT) as
      | [RequestInfo | URL, RequestInit?]
      | undefined
    expect(submitCall).toBeDefined()
    const submitInit = submitCall?.[1]
    expect(submitInit).toBeDefined()
    if (!submitInit) throw new Error('missing submit init')
    expect(submitInit.method).toBe('POST')
    expect(submitInit.headers).toEqual({
      Authorization: 'Bearer bl-key',
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
      'X-DashScope-OssResourceResolve': 'enable',
    })
    const submitBody = JSON.parse(String(submitInit.body)) as {
      model: string
      input: { video_url: string; audio_url: string }
    }
    expect(submitBody.model).toBe('videoretalk')
    expect(submitBody.input.video_url).toMatch(/^oss:\/\/dashscope-instant\/upload-dir\/video-/)
    expect(submitBody.input.audio_url).toMatch(/^oss:\/\/dashscope-instant\/upload-dir\/audio-/)

    const uploadCalls = fetchMock.mock.calls.filter(([input]) => String(input) === UPLOAD_HOST)
    expect(uploadCalls.length).toBe(2)
    expect(result).toEqual({
      requestId: 'task-123',
      externalId: 'BAILIAN:VIDEO:task-123',
      async: true,
    })
  })

  it('throws explicit error when bailian task id is missing', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith(`${POLICY_ENDPOINT}?action=getPolicy&model=videoretalk`)) {
        return buildJsonResponse({
          data: {
            upload_host: UPLOAD_HOST,
            upload_dir: 'dashscope-instant/upload-dir',
            oss_access_key_id: 'ak',
            policy: 'policy',
            signature: 'sig',
          },
        })
      }
      if (url === UPLOAD_HOST) {
        return {
          ok: true,
          status: 200,
          text: async () => '',
        } as unknown as Response
      }
      if (url === SUBMIT_ENDPOINT) {
        return buildJsonResponse({
          output: {
            task_status: 'PENDING',
          },
        })
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    await expect(generateLipSync(
      {
        videoUrl: 'data:video/mp4;base64,dmk=',
        audioUrl: 'data:audio/wav;base64,YXU=',
        audioDurationMs: 3000,
        videoDurationMs: 5000,
      },
      'user-1',
      'bailian::videoretalk',
    )).rejects.toThrow('BAILIAN_LIPSYNC_TASK_ID_MISSING')
  })
})
