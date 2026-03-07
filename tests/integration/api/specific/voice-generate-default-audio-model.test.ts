import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireProjectAuthLight: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
    project: { id: 'project-1', userId: 'user-1', mode: 'novel-promotion' },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn(async () => ({ audioModel: 'fal::fal-ai/index-tts-2/text-to-speech' })),
  },
  novelPromotionProject: {
    findUnique: vi.fn<() => Promise<{
      id: string
      audioModel: string | null
      characters: Array<{ name: string; customVoiceUrl: string; voiceId: string | null }>
    } | null>>(async () => ({
      id: 'np-1',
      audioModel: 'fal::project-tts-model',
      characters: [
        { name: 'Narrator', customVoiceUrl: 'https://voice.example/narrator.wav', voiceId: null },
      ],
    })),
  },
  novelPromotionEpisode: {
    findFirst: vi.fn(async () => ({
      id: 'episode-1',
      speakerVoices: '{}',
    })),
  },
  novelPromotionVoiceLine: {
    findFirst: vi.fn(async () => ({
      id: 'line-1',
      speaker: 'Narrator',
      content: 'hello world',
    })),
    findMany: vi.fn(async () => []),
  },
}))

const submitTaskMock = vi.hoisted(() => vi.fn<typeof import('@/lib/task/submitter').submitTask>(async () => ({
  success: true,
  async: true,
  taskId: 'task-1',
  runId: null,
  status: 'queued',
  deduped: false,
})))

const apiConfigMock = vi.hoisted(() => ({
  resolveModelSelectionOrSingle: vi.fn(async (_userId: string, model: string | null | undefined) => ({
    provider: 'fal',
    modelId: 'fal-ai/index-tts-2/text-to-speech',
    modelKey: model || 'fal::fal-ai/index-tts-2/text-to-speech',
    mediaType: 'audio',
  })),
  getProviderKey: vi.fn((providerId: string) => providerId),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/task/submitter', () => ({ submitTask: submitTaskMock }))
vi.mock('@/lib/api-config', () => apiConfigMock)
vi.mock('@/lib/task/resolve-locale', () => ({
  resolveRequiredTaskLocale: vi.fn(() => 'zh'),
}))
vi.mock('@/lib/billing', () => ({
  buildDefaultTaskBillingInfo: vi.fn(() => ({ mode: 'default' })),
}))
vi.mock('@/lib/task/has-output', () => ({
  hasVoiceLineAudioOutput: vi.fn(async () => false),
}))

describe('api specific - voice generate default audio model', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses project audioModel when request does not provide one', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/voice-generate/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/voice-generate',
      method: 'POST',
      body: {
        episodeId: 'episode-1',
        lineId: 'line-1',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)
    expect(apiConfigMock.resolveModelSelectionOrSingle).toHaveBeenCalledWith(
      'user-1',
      'fal::project-tts-model',
      'audio',
    )

    const submitCall = submitTaskMock.mock.calls[0] as [{ payload?: Record<string, unknown> }] | undefined
    const submitArg = submitCall?.[0]
    expect(submitArg?.payload?.audioModel).toBe('fal::project-tts-model')
  })

  it('request audioModel overrides user preference audioModel', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/voice-generate/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/voice-generate',
      method: 'POST',
      body: {
        episodeId: 'episode-1',
        lineId: 'line-1',
        audioModel: 'fal::custom-tts',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)
    expect(apiConfigMock.resolveModelSelectionOrSingle).toHaveBeenCalledWith(
      'user-1',
      'fal::custom-tts',
      'audio',
    )
  })

  it('falls back to user preference audioModel when project audioModel is empty', async () => {
    prismaMock.novelPromotionProject.findUnique.mockResolvedValueOnce({
      id: 'np-1',
      audioModel: null,
      characters: [
        { name: 'Narrator', customVoiceUrl: 'https://voice.example/narrator.wav', voiceId: null },
      ],
    })

    const mod = await import('@/app/api/novel-promotion/[projectId]/voice-generate/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/voice-generate',
      method: 'POST',
      body: {
        episodeId: 'episode-1',
        lineId: 'line-1',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)
    expect(apiConfigMock.resolveModelSelectionOrSingle).toHaveBeenCalledWith(
      'user-1',
      'fal::fal-ai/index-tts-2/text-to-speech',
      'audio',
    )
  })

  it('returns an explicit qwen voiceId error when only uploaded reference audio is available', async () => {
    apiConfigMock.resolveModelSelectionOrSingle.mockResolvedValueOnce({
      provider: 'bailian',
      modelId: 'qwen3-tts-vd-2026-01-26',
      modelKey: 'bailian::qwen3-tts-vd-2026-01-26',
      mediaType: 'audio',
    })

    const mod = await import('@/app/api/novel-promotion/[projectId]/voice-generate/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/voice-generate',
      method: 'POST',
      body: {
        episodeId: 'episode-1',
        lineId: 'line-1',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(400)

    const json = await res.json()
    expect(json.error?.message).toBe('无音色ID，QwenTTS 必须使用 AI 设计音色')
    expect(submitTaskMock).not.toHaveBeenCalled()
  })
})
