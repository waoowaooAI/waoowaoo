type VoiceSource = 'character' | 'speaker'

export type SupportedAudioProviderKey = 'fal' | 'bailian'

export interface CharacterVoiceFields {
  customVoiceUrl?: string | null
  voiceId?: string | null
}

export interface RawSpeakerVoiceEntry {
  provider?: string | null
  voiceType?: string | null
  audioUrl?: string | null
  voiceId?: string | null
  previewAudioUrl?: string | null
}

export type FalSpeakerVoiceEntry = {
  provider: 'fal'
  voiceType: string
  audioUrl: string
}

export type BailianSpeakerVoiceEntry = {
  provider: 'bailian'
  voiceType: string
  voiceId: string
  previewAudioUrl?: string
}

export type SpeakerVoiceEntry = FalSpeakerVoiceEntry | BailianSpeakerVoiceEntry
export type SpeakerVoiceMap = Record<string, SpeakerVoiceEntry>

export type FalVoiceGenerationBinding = {
  provider: 'fal'
  source: VoiceSource
  referenceAudioUrl: string
}

export type BailianVoiceGenerationBinding = {
  provider: 'bailian'
  source: VoiceSource
  voiceId: string
}

export type VoiceGenerationBinding = FalVoiceGenerationBinding | BailianVoiceGenerationBinding

export type SpeakerVoicePatch =
  | {
    provider: 'fal'
    voiceType?: string
    audioUrl: string
  }
  | {
    provider: 'bailian'
    voiceType?: string
    voiceId: string
    previewAudioUrl?: string
  }

function readTrimmedString(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const value = input.trim()
  return value.length > 0 ? value : null
}

function normalizeRawSpeakerVoiceEntry(raw: unknown, speaker: string): SpeakerVoiceEntry {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`SPEAKER_VOICE_ENTRY_INVALID: ${speaker}`)
  }

  const entry = raw as RawSpeakerVoiceEntry
  const provider = readTrimmedString(entry.provider)?.toLowerCase() ?? null
  const voiceType = readTrimmedString(entry.voiceType) ?? 'uploaded'
  const audioUrl = readTrimmedString(entry.audioUrl)
  const voiceId = readTrimmedString(entry.voiceId)
  const previewAudioUrl = readTrimmedString(entry.previewAudioUrl)

  if (provider === 'fal') {
    if (!audioUrl) {
      throw new Error(`SPEAKER_VOICE_ENTRY_INVALID_FAL_AUDIO: ${speaker}`)
    }
    return {
      provider: 'fal',
      voiceType,
      audioUrl,
    }
  }

  if (provider === 'bailian') {
    if (!voiceId) {
      throw new Error(`SPEAKER_VOICE_ENTRY_INVALID_BAILIAN_VOICE_ID: ${speaker}`)
    }
    const preview = previewAudioUrl || audioUrl
    return {
      provider: 'bailian',
      voiceType,
      voiceId,
      ...(preview ? { previewAudioUrl: preview } : {}),
    }
  }

  if (provider) {
    throw new Error(`SPEAKER_VOICE_ENTRY_INVALID_PROVIDER: ${speaker}`)
  }

  if (voiceId) {
    const preview = previewAudioUrl || audioUrl
    return {
      provider: 'bailian',
      voiceType,
      voiceId,
      ...(preview ? { previewAudioUrl: preview } : {}),
    }
  }

  if (audioUrl) {
    return {
      provider: 'fal',
      voiceType,
      audioUrl,
    }
  }

  throw new Error(`SPEAKER_VOICE_ENTRY_MISSING_BINDING: ${speaker}`)
}

export function parseSpeakerVoiceMap(raw: string | null | undefined): SpeakerVoiceMap {
  if (!raw) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('SPEAKER_VOICES_INVALID_JSON')
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('SPEAKER_VOICES_INVALID_SHAPE')
  }

  const record = parsed as Record<string, unknown>
  const result: SpeakerVoiceMap = {}
  for (const [speaker, value] of Object.entries(record)) {
    if (!speaker.trim()) {
      throw new Error('SPEAKER_VOICES_INVALID_SPEAKER')
    }
    result[speaker] = normalizeRawSpeakerVoiceEntry(value, speaker)
  }
  return result
}

function normalizeProviderKey(providerKey: string): SupportedAudioProviderKey | null {
  if (providerKey === 'fal' || providerKey === 'bailian') {
    return providerKey
  }
  return null
}

function toFalBinding(source: VoiceSource, referenceAudioUrl: string | null): FalVoiceGenerationBinding | null {
  if (!referenceAudioUrl) return null
  return {
    provider: 'fal',
    source,
    referenceAudioUrl,
  }
}

function toBailianBinding(source: VoiceSource, voiceId: string | null): BailianVoiceGenerationBinding | null {
  if (!voiceId) return null
  return {
    provider: 'bailian',
    source,
    voiceId,
  }
}

export function resolveVoiceBindingForProvider(params: {
  providerKey: string
  character?: CharacterVoiceFields | null
  speakerVoice?: SpeakerVoiceEntry | null
}): VoiceGenerationBinding | null {
  const providerKey = normalizeProviderKey(params.providerKey)
  if (!providerKey) return null

  const characterAudioUrl = readTrimmedString(params.character?.customVoiceUrl)
  const characterVoiceId = readTrimmedString(params.character?.voiceId)

  if (providerKey === 'fal') {
    const fromCharacter = toFalBinding('character', characterAudioUrl)
    if (fromCharacter) return fromCharacter
    if (params.speakerVoice?.provider !== 'fal') return null
    return toFalBinding('speaker', readTrimmedString(params.speakerVoice.audioUrl))
  }

  const fromCharacter = toBailianBinding('character', characterVoiceId)
  if (fromCharacter) return fromCharacter
  if (params.speakerVoice?.provider !== 'bailian') return null
  return toBailianBinding('speaker', readTrimmedString(params.speakerVoice.voiceId))
}

export function hasVoiceBindingForProvider(params: {
  providerKey: string
  character?: CharacterVoiceFields | null
  speakerVoice?: SpeakerVoiceEntry | null
}): boolean {
  return !!resolveVoiceBindingForProvider(params)
}

export function hasAnyVoiceBinding(params: {
  character?: CharacterVoiceFields | null
  speakerVoice?: SpeakerVoiceEntry | null
}): boolean {
  const characterAudioUrl = readTrimmedString(params.character?.customVoiceUrl)
  const characterVoiceId = readTrimmedString(params.character?.voiceId)
  if (characterAudioUrl || characterVoiceId) return true

  if (!params.speakerVoice) return false
  if (params.speakerVoice.provider === 'fal') {
    return !!readTrimmedString(params.speakerVoice.audioUrl)
  }
  return !!readTrimmedString(params.speakerVoice.voiceId)
}

export function getSpeakerVoicePreviewUrl(speakerVoice?: SpeakerVoiceEntry | null): string | null {
  if (!speakerVoice) return null
  if (speakerVoice.provider === 'fal') {
    return readTrimmedString(speakerVoice.audioUrl)
  }
  return readTrimmedString(speakerVoice.previewAudioUrl)
}
