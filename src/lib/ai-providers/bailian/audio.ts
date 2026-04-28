import { getProviderConfig } from '@/lib/user-api/runtime-config'
import type { AiProviderAudioExecutionContext } from '@/lib/ai-providers/runtime-types'
import type { GenerateResult } from '@/lib/ai-providers/runtime-types'
import { synthesizeWithBailianTTS } from './tts'
import type { BailianGenerateRequestOptions } from './types'
import { assertBailianOfficialModelSupported } from './models'

export interface BailianAudioGenerateParams {
  userId: string
  text: string
  voice?: string
  rate?: number
  options: BailianGenerateRequestOptions
}

function assertRegistered(modelId: string): void {
  assertBailianOfficialModelSupported('audio', modelId)
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function generateBailianAudio(params: BailianAudioGenerateParams): Promise<GenerateResult> {
  assertRegistered(params.options.modelId)
  const voiceId = readTrimmedString(params.voice)
  const text = readTrimmedString(params.text)
  if (!voiceId) {
    throw new Error('BAILIAN_VOICE_ID_REQUIRED')
  }
  if (!text) {
    throw new Error('BAILIAN_TEXT_REQUIRED')
  }

  const { apiKey } = await getProviderConfig(params.userId, params.options.provider)
  const result = await synthesizeWithBailianTTS({
    text,
    voiceId,
    modelId: params.options.modelId,
  }, apiKey)
  if (!result.success || !result.audioData) {
    throw new Error(result.error || 'BAILIAN_AUDIO_SYNTHESIZE_FAILED')
  }
  const fallbackDataUrl = `data:audio/wav;base64,${result.audioData.toString('base64')}`
  const audioUrl = result.audioUrl || fallbackDataUrl

  return {
    success: true,
    audioUrl,
    requestId: result.requestId,
  }
}

export async function executeBailianAudioGeneration(input: AiProviderAudioExecutionContext): Promise<GenerateResult> {
  return await generateBailianAudio({
    userId: input.userId,
    text: input.text,
    voice: input.options?.voice,
    rate: input.options?.rate,
    options: {
      provider: input.selection.provider,
      modelId: input.selection.modelId,
      modelKey: input.selection.modelKey,
    } as BailianGenerateRequestOptions,
  })
}
