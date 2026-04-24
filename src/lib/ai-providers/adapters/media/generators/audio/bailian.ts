/**
 * 阿里百炼语音生成器
 *
 * 支持：
 * - Bailian TTS
 */

import { BaseAudioGenerator, type AudioGenerateParams, type GenerateResult } from '../base'
import { getProviderConfig } from '@/lib/api-config'

export class BailianTTSGenerator extends BaseAudioGenerator {
  protected async doGenerate(params: AudioGenerateParams): Promise<GenerateResult> {
    const { userId, text, voice = 'default', rate = 1.0 } = params
    const { apiKey } = await getProviderConfig(userId, 'bailian')

    const body = {
      text,
      voice,
      rate,
    }

    const response = await fetch('https://dashscope.aliyuncs.com/api/v1/audio/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Bailian TTS failed (${response.status}): ${errorText}`)
    }

    const data = await response.json() as {
      audio_url?: string
      output?: { audio_url?: string }
    }
    const audioUrl = data.audio_url || data.output?.audio_url
    if (!audioUrl) {
      throw new Error('Bailian TTS returned no audio URL')
    }

    return {
      success: true,
      audioUrl,
    }
  }
}
