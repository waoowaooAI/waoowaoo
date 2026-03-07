import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  novelPromotionProject: {
    findUnique: vi.fn(),
  },
  novelPromotionCharacter: {
    findMany: vi.fn(),
  },
  globalCharacter: {
    findMany: vi.fn(),
  },
  globalVoice: {
    findMany: vi.fn(),
  },
  novelPromotionEpisode: {
    findMany: vi.fn(),
  },
}))

const getProviderConfigMock = vi.hoisted(() => vi.fn())
const deleteBailianVoiceMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: getProviderConfigMock,
}))

vi.mock('@/lib/providers/bailian/voice-manage', () => ({
  deleteBailianVoice: deleteBailianVoiceMock,
}))

import {
  collectBailianManagedVoiceIds,
  collectProjectBailianManagedVoiceIds,
  cleanupUnreferencedBailianVoices,
  isBailianManagedVoiceBinding,
} from '@/lib/providers/bailian/voice-cleanup'

describe('bailian voice cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.novelPromotionCharacter.findMany.mockResolvedValue([])
    prismaMock.globalCharacter.findMany.mockResolvedValue([])
    prismaMock.globalVoice.findMany.mockResolvedValue([])
    prismaMock.novelPromotionEpisode.findMany.mockResolvedValue([])
    getProviderConfigMock.mockResolvedValue({
      apiKey: 'bl-key',
    })
    deleteBailianVoiceMock.mockResolvedValue({ requestId: 'req-1' })
  })

  it('identifies managed voice bindings by voiceType or id prefix', () => {
    expect(isBailianManagedVoiceBinding({ voiceType: 'qwen-designed', voiceId: 'voice-a' })).toBe(true)
    expect(isBailianManagedVoiceBinding({ voiceType: 'uploaded', voiceId: 'qwen-tts-vd-voice-b' })).toBe(true)
    expect(isBailianManagedVoiceBinding({ voiceType: 'uploaded', voiceId: 'custom-voice-b' })).toBe(false)
  })

  it('collects and deduplicates managed voice ids', () => {
    const voiceIds = collectBailianManagedVoiceIds([
      { voiceType: 'qwen-designed', voiceId: 'qwen-tts-vd-1' },
      { voiceType: 'qwen-designed', voiceId: 'qwen-tts-vd-1' },
      { voiceType: 'uploaded', voiceId: 'custom-1' },
      { voiceType: null, voiceId: 'qwen-tts-vd-2' },
    ])

    expect(voiceIds).toEqual(['qwen-tts-vd-1', 'qwen-tts-vd-2'])
  })

  it('deletes only unreferenced managed voices', async () => {
    prismaMock.globalVoice.findMany.mockResolvedValue([
      { voiceId: 'qwen-tts-vd-1' },
    ])

    const result = await cleanupUnreferencedBailianVoices({
      voiceIds: ['qwen-tts-vd-1', 'qwen-tts-vd-2'],
      scope: {
        userId: 'user-1',
      },
    })

    expect(getProviderConfigMock).toHaveBeenCalledWith('user-1', 'bailian')
    expect(deleteBailianVoiceMock).toHaveBeenCalledTimes(1)
    expect(deleteBailianVoiceMock).toHaveBeenCalledWith({
      apiKey: 'bl-key',
      voiceId: 'qwen-tts-vd-2',
    })
    expect(result).toEqual({
      requestedVoiceIds: ['qwen-tts-vd-1', 'qwen-tts-vd-2'],
      skippedReferencedVoiceIds: ['qwen-tts-vd-1'],
      deletedVoiceIds: ['qwen-tts-vd-2'],
    })
  })

  it('collects managed voice ids from project characters and speaker voices', async () => {
    prismaMock.novelPromotionProject.findUnique.mockResolvedValue({
      characters: [
        { voiceId: 'qwen-tts-vd-character', voiceType: 'qwen-designed' },
        { voiceId: 'plain-custom', voiceType: 'uploaded' },
      ],
      episodes: [
        {
          speakerVoices: JSON.stringify({
            Narrator: { voiceType: 'qwen-designed', voiceId: 'qwen-tts-vd-inline' },
            Guest: { voiceType: 'uploaded', voiceId: 'uploaded-id' },
          }),
        },
      ],
    })

    const voiceIds = await collectProjectBailianManagedVoiceIds('project-1')
    expect(voiceIds).toEqual(['qwen-tts-vd-character', 'qwen-tts-vd-inline'])
  })
})

