export type VoiceLineBindingSource = 'character' | 'speaker'

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
export type SpeakerVoiceMap = { [speaker: string]: SpeakerVoiceEntry }

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

export type SpeakerVoiceEntryNormalizer = (
  entry: RawSpeakerVoiceEntry,
  speaker: string,
) => SpeakerVoiceEntry | null

export function readTrimmedString(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const value = input.trim()
  return value.length > 0 ? value : null
}

export function readRawSpeakerVoiceEntry(raw: unknown, speaker: string): RawSpeakerVoiceEntry {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`SPEAKER_VOICE_ENTRY_INVALID: ${speaker}`)
  }

  const rawEntry = raw as {
    provider?: unknown
    voiceType?: unknown
    audioUrl?: unknown
    voiceId?: unknown
    previewAudioUrl?: unknown
  }

  return {
    provider: readTrimmedString(rawEntry.provider),
    voiceType: readTrimmedString(rawEntry.voiceType) ?? 'uploaded',
    audioUrl: readTrimmedString(rawEntry.audioUrl),
    voiceId: readTrimmedString(rawEntry.voiceId),
    previewAudioUrl: readTrimmedString(rawEntry.previewAudioUrl),
  }
}

export function hasAnyVoiceBinding(params: {
  character?: CharacterVoiceFields | null
  speakerVoice?: SpeakerVoiceEntry | null
}): boolean {
  if (readTrimmedString(params.character?.customVoiceUrl) || readTrimmedString(params.character?.voiceId)) {
    return true
  }

  const speakerVoice = params.speakerVoice
  if (!speakerVoice) return false
  if ('audioUrl' in speakerVoice) {
    return !!readTrimmedString(speakerVoice.audioUrl)
  }
  return !!readTrimmedString(speakerVoice.voiceId)
}

export function getSpeakerVoicePreviewUrl(speakerVoice?: SpeakerVoiceEntry | null): string | null {
  if (!speakerVoice) return null
  if ('audioUrl' in speakerVoice) {
    return readTrimmedString(speakerVoice.audioUrl)
  }
  return readTrimmedString(speakerVoice.previewAudioUrl)
}
