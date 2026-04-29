import { fal } from '@fal-ai/client'
import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { getAudioApiKey } from '@/lib/user-api/runtime-config'
import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'
import type {
  AiProviderVoiceLineBinding,
  AiProviderVoiceLineBindingInput,
  AiProviderVoiceLineExecutionContext,
  AiProviderVoiceLineResult,
} from '@/lib/ai-providers/runtime-types'
import {
  readTrimmedString,
  type FalSpeakerVoiceEntry,
  type RawSpeakerVoiceEntry,
} from '@/lib/ai-registry/voice-line'
import {
  downloadAudioData,
  getWavDurationFromBuffer,
  resolveReferenceAudioUrl,
} from '@/lib/ai-providers/shared/audio-utils'

const FAL_VOICE_LINE_PROVIDER_KEY = 'fal'

function isFalVoiceLineBinding(binding: AiProviderVoiceLineBinding): binding is Extract<AiProviderVoiceLineBinding, { provider: 'fal' }> {
  return binding.provider === FAL_VOICE_LINE_PROVIDER_KEY
}

function requireFalVoiceLineBinding(binding: AiProviderVoiceLineBinding): Extract<AiProviderVoiceLineBinding, { provider: 'fal' }> {
  if (isFalVoiceLineBinding(binding)) {
    return binding
  }
  throw new Error('请先为该发言人设置参考音频')
}

export function normalizeFalSpeakerVoiceEntry(entry: RawSpeakerVoiceEntry, speaker: string): FalSpeakerVoiceEntry | null {
  const provider = entry.provider?.toLowerCase() ?? null
  const audioUrl = readTrimmedString(entry.audioUrl)
  if (provider && provider !== FAL_VOICE_LINE_PROVIDER_KEY) return null
  if (provider === FAL_VOICE_LINE_PROVIDER_KEY && !audioUrl) {
    throw new Error(`SPEAKER_VOICE_ENTRY_INVALID_FAL_AUDIO: ${speaker}`)
  }
  if (!audioUrl) return null
  return {
    provider: 'fal',
    voiceType: readTrimmedString(entry.voiceType) ?? 'uploaded',
    audioUrl,
  }
}

export function resolveFalVoiceLineBinding(input: AiProviderVoiceLineBindingInput): AiProviderVoiceLineBinding | null {
  const characterAudioUrl = readTrimmedString(input.character?.customVoiceUrl)
  if (characterAudioUrl) {
    return {
      provider: 'fal',
      source: 'character',
      referenceAudioUrl: characterAudioUrl,
    }
  }

  if (input.speakerVoice?.provider !== 'fal') return null
  const speakerAudioUrl = readTrimmedString(input.speakerVoice.audioUrl)
  if (!speakerAudioUrl) return null
  return {
    provider: 'fal',
    source: 'speaker',
    referenceAudioUrl: speakerAudioUrl,
  }
}

export function createFalVoiceLineMissingBindingError(): Error {
  return new Error('请先为该发言人设置参考音频')
}

export async function executeFalVoiceLineGeneration(
  input: AiProviderVoiceLineExecutionContext,
): Promise<AiProviderVoiceLineResult> {
  const binding = requireFalVoiceLineBinding(input.binding)
  const strength = typeof input.emotionStrength === 'number' ? input.emotionStrength : 0.4

  _ulogInfo(`IndexTTS2: Generating with reference audio, strength: ${strength}`)
  if (input.emotionPrompt) {
    _ulogInfo(`IndexTTS2: Using emotion prompt: ${input.emotionPrompt}`)
  }

  const falApiKey = await getAudioApiKey(input.userId, input.selection.modelKey)
  if (falApiKey) {
    fal.config({ credentials: falApiKey })
  }

  const fullAudioUrl = await resolveReferenceAudioUrl(binding.referenceAudioUrl)
  const audioDataUrl = fullAudioUrl.startsWith('data:')
    ? fullAudioUrl
    : await normalizeToBase64ForGeneration(fullAudioUrl)

  const requestInput: {
    audio_url: string
    prompt: string
    should_use_prompt_for_emotion: boolean
    strength: number
    emotion_prompt?: string
  } = {
    audio_url: audioDataUrl,
    prompt: input.text,
    should_use_prompt_for_emotion: true,
    strength,
  }

  if (input.emotionPrompt?.trim()) {
    requestInput.emotion_prompt = input.emotionPrompt.trim()
  }

  const result = await fal.subscribe(input.selection.modelId, {
    input: requestInput,
    logs: false,
  })

  const audioUrl = (result as { data?: { audio?: { url?: string } } })?.data?.audio?.url
  if (!audioUrl) {
    throw new Error('No audio URL in response')
  }

  const audioData = await downloadAudioData(audioUrl)
  return {
    audioData,
    audioDuration: getWavDurationFromBuffer(audioData),
  }
}
