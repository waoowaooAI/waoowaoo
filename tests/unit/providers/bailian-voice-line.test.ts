import { beforeEach, describe, expect, it, vi } from 'vitest'

const getProviderConfigMock = vi.hoisted(() => vi.fn())
const synthesizeWithBailianTTSMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/user-api/runtime-config', () => ({
  getProviderConfig: getProviderConfigMock,
}))

vi.mock('@/lib/ai-providers/bailian/tts', () => ({
  synthesizeWithBailianTTS: synthesizeWithBailianTTSMock,
}))

import { executeBailianVoiceLineGeneration } from '@/lib/ai-providers/bailian/voice-line'

describe('bailian voice-line provider execution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getProviderConfigMock.mockResolvedValue({ apiKey: 'bl-key' })
  })

  it('uses the bound voice id and returns generated audio bytes', async () => {
    const audioData = Buffer.from([1, 2, 3])
    synthesizeWithBailianTTSMock.mockResolvedValue({
      success: true,
      audioData,
      audioDuration: 1234,
    })

    const result = await executeBailianVoiceLineGeneration({
      userId: 'user-1',
      selection: {
        provider: 'bailian',
        modelId: 'qwen3-tts-vd-2026-01-26',
        modelKey: 'bailian::qwen3-tts-vd-2026-01-26',
        variantSubKind: 'official',
      },
      text: '你好',
      binding: {
        provider: 'bailian',
        source: 'speaker',
        voiceId: 'voice_abc123',
      },
    })

    expect(getProviderConfigMock).toHaveBeenCalledWith('user-1', 'bailian')
    expect(synthesizeWithBailianTTSMock).toHaveBeenCalledWith({
      text: '你好',
      voiceId: 'voice_abc123',
      modelId: 'qwen3-tts-vd-2026-01-26',
      languageType: 'Chinese',
    }, 'bl-key')
    expect(result).toEqual({
      audioData,
      audioDuration: 1234,
    })
  })

  it('maps invalid parameter failures to the qwen voice-id guidance error', async () => {
    synthesizeWithBailianTTSMock.mockResolvedValue({
      success: false,
      error: 'BAILIAN_TTS_FAILED(400): InvalidParameter',
    })

    await expect(
      executeBailianVoiceLineGeneration({
        userId: 'user-1',
        selection: {
          provider: 'bailian',
          modelId: 'qwen3-tts-vd-2026-01-26',
          modelKey: 'bailian::qwen3-tts-vd-2026-01-26',
          variantSubKind: 'official',
        },
        text: '你好',
        binding: {
          provider: 'bailian',
          source: 'speaker',
          voiceId: 'bad-voice',
        },
      }),
    ).rejects.toThrow('无效音色ID，QwenTTS 必须使用 AI 设计音色')
  })
})
