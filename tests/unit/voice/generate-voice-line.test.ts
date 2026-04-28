import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
  },
  projectVoiceLine: {
    findUnique: vi.fn(),
    update: vi.fn(async () => undefined),
  },
  projectEpisode: {
    findUnique: vi.fn(),
  },
}))

const resolveModelSelectionOrSingleMock = vi.hoisted(() => vi.fn())
const executeVoiceLineGenerationMock = vi.hoisted(() => vi.fn())
const getSignedUrlMock = vi.hoisted(() => vi.fn((storageKey: string) => `signed://${storageKey}`))
const uploadObjectMock = vi.hoisted(() => vi.fn(async () => 'voice/storage/line-1.wav'))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/user-api/runtime-config', () => ({
  resolveModelSelectionOrSingle: resolveModelSelectionOrSingleMock,
}))

vi.mock('@/lib/ai-exec/engine', () => ({
  executeVoiceLineGeneration: executeVoiceLineGenerationMock,
}))

vi.mock('@/lib/storage', () => ({
  getSignedUrl: getSignedUrlMock,
  uploadObject: uploadObjectMock,
}))

import { generateVoiceLine } from '@/lib/voice/generate-voice-line'

describe('generate voice line with bailian provider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const audioBytes = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])

    prismaMock.projectVoiceLine.findUnique.mockResolvedValue({
      id: 'line-1',
      episodeId: 'episode-1',
      speaker: 'Narrator',
      content: '你好，世界',
      emotionPrompt: null,
      emotionStrength: null,
    })
    prismaMock.project.findUnique.mockResolvedValue({
      id: 'project-1',
      characters: [],
    })
    prismaMock.projectEpisode.findUnique.mockResolvedValue({
      speakerVoices: JSON.stringify({
        Narrator: {
          audioUrl: 'voice/reference.wav',
          voiceId: 'voice_abc123',
        },
      }),
    })

    resolveModelSelectionOrSingleMock.mockResolvedValue({
      provider: 'bailian',
      modelId: 'qwen3-tts-vd-2026-01-26',
      modelKey: 'bailian::qwen3-tts-vd-2026-01-26',
      mediaType: 'audio',
    })

    executeVoiceLineGenerationMock.mockResolvedValue({
      audioData: Buffer.from(audioBytes),
      audioDuration: 1,
    })
  })

  it('uses speaker voiceId to generate and persists uploaded audio', async () => {
    const result = await generateVoiceLine({
      projectId: 'project-1',
      episodeId: 'episode-1',
      lineId: 'line-1',
      userId: 'user-1',
      audioModel: 'bailian::qwen3-tts-vd-2026-01-26',
    })

    expect(executeVoiceLineGenerationMock).toHaveBeenCalledWith({
      userId: 'user-1',
      selection: {
        provider: 'bailian',
        modelId: 'qwen3-tts-vd-2026-01-26',
        modelKey: 'bailian::qwen3-tts-vd-2026-01-26',
        mediaType: 'audio',
      },
      text: '你好，世界',
      emotionPrompt: null,
      emotionStrength: null,
      binding: {
        provider: 'bailian',
        source: 'speaker',
        voiceId: 'voice_abc123',
      },
    })
    expect(uploadObjectMock).toHaveBeenCalledTimes(1)
    expect(prismaMock.projectVoiceLine.update).toHaveBeenCalledWith({
      where: { id: 'line-1' },
      data: {
        audioUrl: 'voice/storage/line-1.wav',
        audioDuration: 1,
      },
    })
    expect(result).toEqual({
      lineId: 'line-1',
      audioUrl: 'signed://voice/storage/line-1.wav',
      storageKey: 'voice/storage/line-1.wav',
      audioDuration: 1,
    })
  })

  it('fails explicitly when bailian speaker binding only has uploaded audio', async () => {
    prismaMock.projectEpisode.findUnique.mockResolvedValueOnce({
      speakerVoices: JSON.stringify({
        Narrator: {
          audioUrl: 'voice/reference.wav',
        },
      }),
    })

    await expect(
      generateVoiceLine({
        projectId: 'project-1',
        episodeId: 'episode-1',
        lineId: 'line-1',
        userId: 'user-1',
        audioModel: 'bailian::qwen3-tts-vd-2026-01-26',
      }),
    ).rejects.toThrow('无音色ID，QwenTTS 必须使用 AI 设计音色')

    expect(executeVoiceLineGenerationMock).not.toHaveBeenCalled()
    expect(uploadObjectMock).not.toHaveBeenCalled()
  })

  it('propagates provider execution errors and does not upload partial audio', async () => {
    executeVoiceLineGenerationMock.mockRejectedValueOnce(new Error('PROVIDER_EXECUTION_FAILED'))

    await expect(
      generateVoiceLine({
        projectId: 'project-1',
        episodeId: 'episode-1',
        lineId: 'line-1',
        userId: 'user-1',
        audioModel: 'bailian::qwen3-tts-vd-2026-01-26',
      }),
    ).rejects.toThrow('PROVIDER_EXECUTION_FAILED')

    expect(uploadObjectMock).not.toHaveBeenCalled()
  })
})
