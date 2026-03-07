import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_VOICE_SCHEME_COUNT,
  MAX_VOICE_SCHEME_COUNT,
  MIN_VOICE_SCHEME_COUNT,
  generateVoiceDesignOptions,
  normalizeVoiceSchemeCount,
} from '@/components/voice/voice-design-shared'

describe('voice-design-shared', () => {
  it('clamps scheme count into the supported range', () => {
    expect(normalizeVoiceSchemeCount(undefined)).toBe(DEFAULT_VOICE_SCHEME_COUNT)
    expect(normalizeVoiceSchemeCount('not-a-number')).toBe(DEFAULT_VOICE_SCHEME_COUNT)
    expect(normalizeVoiceSchemeCount(0)).toBe(MIN_VOICE_SCHEME_COUNT)
    expect(normalizeVoiceSchemeCount(99)).toBe(MAX_VOICE_SCHEME_COUNT)
    expect(normalizeVoiceSchemeCount('5')).toBe(5)
  })

  it('generates the requested number of voice options with default preview text fallback', async () => {
    const onDesignVoice = vi
      .fn<(_: {
        voicePrompt: string
        previewText: string
        preferredName: string
        language: 'zh'
      }) => Promise<{ voiceId: string; audioBase64: string }>>()
      .mockResolvedValueOnce({ voiceId: 'voice-1', audioBase64: 'audio-1' })
      .mockResolvedValueOnce({ voiceId: 'voice-2', audioBase64: 'audio-2' })
      .mockResolvedValueOnce({ voiceId: 'voice-3', audioBase64: 'audio-3' })
      .mockResolvedValueOnce({ voiceId: 'voice-4', audioBase64: 'audio-4' })

    const result = await generateVoiceDesignOptions({
      count: '4',
      voicePrompt: ' 温柔女声 ',
      previewText: '   ',
      defaultPreviewText: '默认试听文案',
      onDesignVoice,
      createPreferredName: (index) => `preferred-${index + 1}`,
    })

    expect(result).toEqual([
      { voiceId: 'voice-1', audioBase64: 'audio-1', audioUrl: 'data:audio/wav;base64,audio-1' },
      { voiceId: 'voice-2', audioBase64: 'audio-2', audioUrl: 'data:audio/wav;base64,audio-2' },
      { voiceId: 'voice-3', audioBase64: 'audio-3', audioUrl: 'data:audio/wav;base64,audio-3' },
      { voiceId: 'voice-4', audioBase64: 'audio-4', audioUrl: 'data:audio/wav;base64,audio-4' },
    ])
    expect(onDesignVoice.mock.calls).toEqual([
      [{ voicePrompt: '温柔女声', previewText: '默认试听文案', preferredName: 'preferred-1', language: 'zh' }],
      [{ voicePrompt: '温柔女声', previewText: '默认试听文案', preferredName: 'preferred-2', language: 'zh' }],
      [{ voicePrompt: '温柔女声', previewText: '默认试听文案', preferredName: 'preferred-3', language: 'zh' }],
      [{ voicePrompt: '温柔女声', previewText: '默认试听文案', preferredName: 'preferred-4', language: 'zh' }],
    ])
  })

  it('fails explicitly when a designed voice is missing voiceId', async () => {
    const onDesignVoice = vi.fn(async () => ({ voiceId: '', audioBase64: 'audio-only' }))

    await expect(
      generateVoiceDesignOptions({
        count: 1,
        voicePrompt: '旁白',
        previewText: '测试',
        defaultPreviewText: '默认试听文案',
        onDesignVoice,
      }),
    ).rejects.toThrow('VOICE_DESIGN_INVALID_RESPONSE: missing voiceId')
  })
})
