import {
  hasRegisteredVoiceLineBinding,
  parseSpeakerVoiceMap,
  resolveAiProviderAdapter,
} from '@/lib/ai-providers'
import type {
  CharacterVoiceFields,
  SpeakerVoiceEntry,
  SpeakerVoiceMap,
} from '@/lib/ai-registry/voice-line'

export { parseSpeakerVoiceMap }
export type { CharacterVoiceFields, SpeakerVoiceEntry, SpeakerVoiceMap }

export function hasAiVoiceLineBinding(params: {
  providerId: string
  character?: CharacterVoiceFields | null
  speakerVoice?: SpeakerVoiceEntry | null
}): boolean {
  return hasRegisteredVoiceLineBinding(params)
}

export function resolveAiVoiceLineBindingOrThrow(params: {
  providerId: string
  character?: CharacterVoiceFields | null
  speakerVoice?: SpeakerVoiceEntry | null
}) {
  const voiceLineProvider = resolveAiProviderAdapter(params.providerId).voiceLine
  if (!voiceLineProvider) {
    throw new Error(`AUDIO_PROVIDER_UNSUPPORTED: ${params.providerId}`)
  }
  const binding = voiceLineProvider.resolveBinding({
    character: params.character,
    speakerVoice: params.speakerVoice,
  })
  if (!binding) {
    throw voiceLineProvider.createMissingBindingError({
      character: params.character,
      speakerVoice: params.speakerVoice,
    })
  }
  return binding
}
