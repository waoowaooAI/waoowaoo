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
  novelPromotionProject: {
    findUnique: vi.fn(async () => ({ id: 'np-1' })),
  },
  novelPromotionEpisode: {
    findUnique: vi.fn(async () => ({
      id: 'episode-1',
      speakerVoices: '{}',
    })),
    findFirst: vi.fn(async () => ({
      id: 'episode-1',
      speakerVoices: '{}',
    })),
    update: vi.fn<(args: { data?: { speakerVoices?: string } }) => Promise<{ id: string }>>(async () => ({ id: 'episode-1' })),
  },
}))

const resolveStorageKeyFromMediaValueMock = vi.hoisted(() => vi.fn(async (input: string) => {
  if (input.includes('fal')) return 'voice/storage/fal.wav'
  if (input.includes('preview')) return 'voice/storage/preview.wav'
  return null
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/media/service', () => ({
  resolveStorageKeyFromMediaValue: resolveStorageKeyFromMediaValueMock,
}))

describe('api specific - speaker voice provider contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns INVALID_PARAMS when provider is missing in PATCH payload', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/speaker-voice/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/speaker-voice',
      method: 'PATCH',
      body: {
        episodeId: 'episode-1',
        speaker: 'Narrator',
        voiceType: 'uploaded',
        audioUrl: '/m/fal-reference',
      },
    })

    const res = await mod.PATCH(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVALID_PARAMS')
    expect(prismaMock.novelPromotionEpisode.update).not.toHaveBeenCalled()
  })

  it('stores fal speaker voice with explicit provider and normalized audio storage key', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/speaker-voice/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/speaker-voice',
      method: 'PATCH',
      body: {
        episodeId: 'episode-1',
        speaker: 'Narrator',
        provider: 'fal',
        voiceType: 'uploaded',
        audioUrl: '/m/fal-reference',
      },
    })

    const res = await mod.PATCH(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)

    const updateCall = prismaMock.novelPromotionEpisode.update.mock.calls[0] as
      | [{ data?: { speakerVoices?: string } }]
      | undefined
    expect(updateCall).toBeTruthy()
    if (!updateCall) throw new Error('expected update call')
    const updateArg = updateCall[0]
    const saved = JSON.parse(updateArg.data?.speakerVoices || '{}') as Record<string, unknown>

    expect(resolveStorageKeyFromMediaValueMock).toHaveBeenCalledWith('/m/fal-reference')
    expect(saved.Narrator).toEqual({
      provider: 'fal',
      voiceType: 'uploaded',
      audioUrl: 'voice/storage/fal.wav',
    })
  })

  it('stores bailian speaker voice with explicit provider and voiceId', async () => {
    const mod = await import('@/app/api/novel-promotion/[projectId]/speaker-voice/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/speaker-voice',
      method: 'PATCH',
      body: {
        episodeId: 'episode-1',
        speaker: 'Narrator',
        provider: 'bailian',
        voiceType: 'qwen-designed',
        voiceId: 'qwen-tts-vd-001',
        previewAudioUrl: '/m/preview-audio',
      },
    })

    const res = await mod.PATCH(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)

    const updateCall = prismaMock.novelPromotionEpisode.update.mock.calls[0] as
      | [{ data?: { speakerVoices?: string } }]
      | undefined
    expect(updateCall).toBeTruthy()
    if (!updateCall) throw new Error('expected update call')
    const updateArg = updateCall[0]
    const saved = JSON.parse(updateArg.data?.speakerVoices || '{}') as Record<string, unknown>

    expect(resolveStorageKeyFromMediaValueMock).toHaveBeenCalledWith('/m/preview-audio')
    expect(saved.Narrator).toEqual({
      provider: 'bailian',
      voiceType: 'qwen-designed',
      voiceId: 'qwen-tts-vd-001',
      previewAudioUrl: 'voice/storage/preview.wav',
    })
  })
})
