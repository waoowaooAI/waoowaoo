import { describe, expect, it } from 'vitest'
import {
  getSpeakerVoicePreviewUrl,
  hasAnyVoiceBinding,
  parseSpeakerVoiceMap,
  resolveVoiceBindingForProvider,
} from '@/lib/voice/provider-voice-binding'

describe('provider voice binding', () => {
  it('parses legacy fal speaker voice entry to explicit fal provider', () => {
    const map = parseSpeakerVoiceMap(JSON.stringify({
      Narrator: {
        voiceType: 'uploaded',
        audioUrl: 'voice/reference.wav',
      },
    }))

    expect(map.Narrator).toEqual({
      provider: 'fal',
      voiceType: 'uploaded',
      audioUrl: 'voice/reference.wav',
    })
  })

  it('parses legacy bailian entry with voiceId and preview audio', () => {
    const map = parseSpeakerVoiceMap(JSON.stringify({
      Narrator: {
        voiceType: 'qwen-designed',
        voiceId: 'qwen-tts-vd-001',
        audioUrl: 'voice/qwen-preview.wav',
      },
    }))

    expect(map.Narrator).toEqual({
      provider: 'bailian',
      voiceType: 'qwen-designed',
      voiceId: 'qwen-tts-vd-001',
      previewAudioUrl: 'voice/qwen-preview.wav',
    })
  })

  it('resolves bailian binding from speaker voiceId when character has no voice', () => {
    const map = parseSpeakerVoiceMap(JSON.stringify({
      Narrator: {
        provider: 'bailian',
        voiceType: 'qwen-designed',
        voiceId: 'qwen-tts-vd-001',
      },
    }))

    const binding = resolveVoiceBindingForProvider({
      providerKey: 'bailian',
      character: { customVoiceUrl: null, voiceId: null },
      speakerVoice: map.Narrator,
    })

    expect(binding).toEqual({
      provider: 'bailian',
      source: 'speaker',
      voiceId: 'qwen-tts-vd-001',
    })
  })

  it('does not treat bailian voice entry as fal reference audio', () => {
    const map = parseSpeakerVoiceMap(JSON.stringify({
      Narrator: {
        provider: 'bailian',
        voiceType: 'qwen-designed',
        voiceId: 'qwen-tts-vd-001',
        previewAudioUrl: 'voice/qwen-preview.wav',
      },
    }))

    const binding = resolveVoiceBindingForProvider({
      providerKey: 'fal',
      character: { customVoiceUrl: null, voiceId: null },
      speakerVoice: map.Narrator,
    })

    expect(binding).toBeNull()
  })

  it('returns preview url from fal and bailian entry correctly', () => {
    const map = parseSpeakerVoiceMap(JSON.stringify({
      FalSpeaker: {
        provider: 'fal',
        voiceType: 'uploaded',
        audioUrl: 'voice/fal.wav',
      },
      BailianSpeaker: {
        provider: 'bailian',
        voiceType: 'qwen-designed',
        voiceId: 'qwen-tts-vd-001',
        previewAudioUrl: 'voice/qwen-preview.wav',
      },
    }))

    expect(getSpeakerVoicePreviewUrl(map.FalSpeaker)).toBe('voice/fal.wav')
    expect(getSpeakerVoicePreviewUrl(map.BailianSpeaker)).toBe('voice/qwen-preview.wav')
    expect(hasAnyVoiceBinding({ speakerVoice: map.BailianSpeaker })).toBe(true)
  })

  it('throws explicitly when a speaker entry has no usable binding', () => {
    expect(() => parseSpeakerVoiceMap(JSON.stringify({
      Narrator: {
        voiceType: 'uploaded',
      },
    }))).toThrow('SPEAKER_VOICE_ENTRY_MISSING_BINDING')
  })
})
