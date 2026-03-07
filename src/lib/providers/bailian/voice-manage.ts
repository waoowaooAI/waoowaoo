const BAILIAN_VOICE_CUSTOMIZATION_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization'

interface BailianVoiceManageResponse {
  request_id?: string
  code?: string
  message?: string
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

async function parseManageResponse(response: Response): Promise<BailianVoiceManageResponse> {
  const raw = await response.text()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('BAILIAN_VOICE_MANAGE_RESPONSE_INVALID')
    }
    return parsed as BailianVoiceManageResponse
  } catch {
    throw new Error('BAILIAN_VOICE_MANAGE_RESPONSE_INVALID_JSON')
  }
}

export async function deleteBailianVoice(params: {
  apiKey: string
  voiceId: string
}): Promise<{ requestId?: string }> {
  const apiKey = readTrimmedString(params.apiKey)
  const voiceId = readTrimmedString(params.voiceId)
  if (!apiKey) {
    throw new Error('BAILIAN_API_KEY_REQUIRED')
  }
  if (!voiceId) {
    throw new Error('BAILIAN_VOICE_ID_REQUIRED')
  }

  const response = await fetch(BAILIAN_VOICE_CUSTOMIZATION_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'qwen-voice-design',
      input: {
        action: 'delete',
        voice: voiceId,
      },
    }),
  })

  const data = await parseManageResponse(response)
  if (!response.ok) {
    const code = readTrimmedString(data.code)
    const message = readTrimmedString(data.message)
    throw new Error(`BAILIAN_VOICE_DELETE_FAILED(${response.status}): ${code || message || 'unknown error'}`)
  }

  return {
    requestId: readTrimmedString(data.request_id) || undefined,
  }
}

