import { getProviderConfig } from '@/lib/user-api/runtime-config'
import type {
  AiProviderVoiceLineBinding,
  AiProviderVoiceLineBindingInput,
  AiProviderVoiceLineExecutionContext,
  AiProviderVoiceLineResult,
} from '@/lib/ai-providers/runtime-types'
import { getWavDurationFromBuffer } from '@/lib/ai-providers/shared/audio-utils'
import {
  readTrimmedString,
  type BailianSpeakerVoiceEntry,
  type RawSpeakerVoiceEntry,
} from '@/lib/ai-providers/shared/voice-line-binding'
import { synthesizeWithBailianTTS } from './tts'

const BAILIAN_VOICE_LINE_PROVIDER_KEY = 'bailian'

function isBailianVoiceLineBinding(binding: AiProviderVoiceLineBinding): binding is Extract<AiProviderVoiceLineBinding, { provider: 'bailian' }> {
  return binding.provider === BAILIAN_VOICE_LINE_PROVIDER_KEY
}

function requireBailianVoiceLineBinding(binding: AiProviderVoiceLineBinding): Extract<AiProviderVoiceLineBinding, { provider: 'bailian' }> {
  if (isBailianVoiceLineBinding(binding)) {
    return binding
  }
  throw new Error('请先为该发言人绑定百炼音色')
}

export function normalizeBailianSpeakerVoiceEntry(entry: RawSpeakerVoiceEntry, speaker: string): BailianSpeakerVoiceEntry | null {
  const provider = entry.provider?.toLowerCase() ?? null
  const voiceId = readTrimmedString(entry.voiceId)
  if (provider && provider !== BAILIAN_VOICE_LINE_PROVIDER_KEY) return null
  if (provider === BAILIAN_VOICE_LINE_PROVIDER_KEY && !voiceId) {
    throw new Error(`SPEAKER_VOICE_ENTRY_INVALID_BAILIAN_VOICE_ID: ${speaker}`)
  }
  if (!voiceId) return null
  const previewAudioUrl = readTrimmedString(entry.previewAudioUrl) || readTrimmedString(entry.audioUrl)
  return {
    provider: 'bailian',
    voiceType: readTrimmedString(entry.voiceType) ?? 'uploaded',
    voiceId,
    ...(previewAudioUrl ? { previewAudioUrl } : {}),
  }
}

export function resolveBailianVoiceLineBinding(input: AiProviderVoiceLineBindingInput): AiProviderVoiceLineBinding | null {
  const characterVoiceId = readTrimmedString(input.character?.voiceId)
  if (characterVoiceId) {
    return {
      provider: 'bailian',
      source: 'character',
      voiceId: characterVoiceId,
    }
  }

  if (input.speakerVoice?.provider !== 'bailian') return null
  const speakerVoiceId = readTrimmedString(input.speakerVoice.voiceId)
  if (!speakerVoiceId) return null
  return {
    provider: 'bailian',
    source: 'speaker',
    voiceId: speakerVoiceId,
  }
}

export function createBailianVoiceLineMissingBindingError(input: AiProviderVoiceLineBindingInput): Error {
  const hasUploadedReference =
    !!readTrimmedString(input.character?.customVoiceUrl) ||
    (!!input.speakerVoice && 'audioUrl' in input.speakerVoice && !!readTrimmedString(input.speakerVoice.audioUrl))
  if (hasUploadedReference) {
    return new Error('无音色ID，QwenTTS 必须使用 AI 设计音色')
  }
  return new Error('请先为该发言人绑定百炼音色')
}

function normalizeBailianVoiceGenerationError(errorMessage: string | null | undefined): string {
  const message = typeof errorMessage === 'string' ? errorMessage.trim() : ''
  if (!message) return 'BAILIAN_AUDIO_GENERATION_FAILED'

  const normalized = message.toLowerCase()
  if (
    normalized.includes('bailian_tts_failed(400): invalidparameter') ||
    normalized.includes('invalidparameter')
  ) {
    return '无效音色ID，QwenTTS 必须使用 AI 设计音色'
  }

  return message
}

export async function executeBailianVoiceLineGeneration(
  input: AiProviderVoiceLineExecutionContext,
): Promise<AiProviderVoiceLineResult> {
  const binding = requireBailianVoiceLineBinding(input.binding)
  const { apiKey } = await getProviderConfig(input.userId, input.selection.provider)
  const result = await synthesizeWithBailianTTS({
    text: input.text,
    voiceId: binding.voiceId,
    modelId: input.selection.modelId,
    languageType: 'Chinese',
  }, apiKey)
  if (!result.success || !result.audioData) {
    throw new Error(normalizeBailianVoiceGenerationError(result.error))
  }

  const audioData = result.audioData
  return {
    audioData,
    audioDuration: result.audioDuration ?? getWavDurationFromBuffer(audioData),
  }
}
