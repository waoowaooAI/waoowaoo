import { logInfo as _ulogInfo } from '@/lib/logging/core'

export interface VoiceDesignInput {
  voicePrompt: string
  previewText: string
  preferredName?: string
  language?: 'zh' | 'en'
}

export interface VoiceDesignResult {
  success: boolean
  voiceId?: string
  targetModel?: string
  audioBase64?: string
  sampleRate?: number
  responseFormat?: string
  usageCount?: number
  requestId?: string
  error?: string
  errorCode?: string
}

export async function createVoiceDesign(
  input: VoiceDesignInput,
  apiKey: string,
): Promise<VoiceDesignResult> {
  if (!apiKey) {
    return {
      success: false,
      error: '请配置阿里百炼 API Key',
    }
  }

  const requestBody = {
    model: 'qwen-voice-design',
    input: {
      action: 'create',
      target_model: 'qwen3-tts-vd-2026-01-26',
      voice_prompt: input.voicePrompt,
      preview_text: input.previewText,
      preferred_name: input.preferredName || 'custom_voice',
      language: input.language || 'zh',
    },
    parameters: {
      sample_rate: 24000,
      response_format: 'wav',
    },
  }

  _ulogInfo('[VoiceDesign] 请求体:', JSON.stringify(requestBody, null, 2))

  try {
    const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    const data = await response.json() as {
      output?: {
        voice?: string
        target_model?: string
        preview_audio?: {
          data?: string
          sample_rate?: number
          response_format?: string
        }
      }
      usage?: { count?: number }
      request_id?: string
      code?: string
      message?: string
    }

    if (response.ok && data.output) {
      return {
        success: true,
        voiceId: data.output.voice,
        targetModel: data.output.target_model,
        audioBase64: data.output.preview_audio?.data,
        sampleRate: data.output.preview_audio?.sample_rate,
        responseFormat: data.output.preview_audio?.response_format,
        usageCount: data.usage?.count,
        requestId: data.request_id,
      }
    }

    return {
      success: false,
      error: data.message || '声音设计 API 调用失败',
      errorCode: data.code,
      requestId: data.request_id,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '网络请求失败'
    return {
      success: false,
      error: message || '网络请求失败',
    }
  }
}

export function validateVoicePrompt(voicePrompt: string): { valid: boolean; error?: string } {
  if (!voicePrompt || voicePrompt.trim().length === 0) {
    return { valid: false, error: '声音提示词不能为空' }
  }
  if (voicePrompt.length > 500) {
    return { valid: false, error: '声音提示词不能超过500个字符' }
  }
  return { valid: true }
}

export function validatePreviewText(previewText: string): { valid: boolean; error?: string } {
  if (!previewText || previewText.trim().length === 0) {
    return { valid: false, error: '预览文本不能为空' }
  }
  if (previewText.length < 5) {
    return { valid: false, error: '预览文本至少需要5个字符' }
  }
  if (previewText.length > 200) {
    return { valid: false, error: '预览文本不能超过200个字符' }
  }
  return { valid: true }
}
