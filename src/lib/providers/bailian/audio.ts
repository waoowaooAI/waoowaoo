import {
  assertOfficialModelRegistered,
  type OfficialModelModality,
} from '@/lib/providers/official/model-registry'
import { getProviderConfig } from '@/lib/api-config'
import type { GenerateResult } from '@/lib/generators/base'
import { ensureBailianCatalogRegistered } from './catalog'
import { synthesizeWithBailianTTS } from './tts'
import type { BailianGenerateRequestOptions } from './types'

export interface BailianAudioGenerateParams {
  userId: string
  text: string
  voice?: string
  rate?: number
  options: BailianGenerateRequestOptions
}

function assertRegistered(modelId: string): void {
  ensureBailianCatalogRegistered()
  assertOfficialModelRegistered({
    provider: 'bailian',
    modality: 'audio' satisfies OfficialModelModality,
    modelId,
  })
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
