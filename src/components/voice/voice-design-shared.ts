export const DEFAULT_VOICE_SCHEME_COUNT = 3
export const MIN_VOICE_SCHEME_COUNT = 1
export const MAX_VOICE_SCHEME_COUNT = 10

export type VoiceDesignMutationPayload = {
  voicePrompt: string
  previewText: string
  preferredName: string
  language: 'zh'
}

export type VoiceDesignMutationResult = {
  voiceId?: string
  audioBase64?: string
  detail?: string
}

export type GeneratedVoice = {
  voiceId: string
  audioBase64: string
  audioUrl: string
}

export function normalizeVoiceSchemeCount(input: string | number | undefined): number {
  const rawValue = typeof input === 'number' ? input : Number.parseInt(input ?? '', 10)
  if (!Number.isFinite(rawValue)) return DEFAULT_VOICE_SCHEME_COUNT
  return Math.min(MAX_VOICE_SCHEME_COUNT, Math.max(MIN_VOICE_SCHEME_COUNT, rawValue))
}

export function createVoiceDesignPreferredName(index: number, now: () => number = Date.now): string {
  return `voice_${now().toString(36)}_${index + 1}`.slice(0, 16)
}

interface GenerateVoiceDesignOptionsParams {
  count: string | number | undefined
  voicePrompt: string
  previewText: string
  defaultPreviewText: string
  language?: 'zh'
  onDesignVoice: (payload: VoiceDesignMutationPayload) => Promise<VoiceDesignMutationResult>
  createPreferredName?: (index: number) => string
}

export async function generateVoiceDesignOptions({
  count,
  voicePrompt,
  previewText,
  defaultPreviewText,
  language = 'zh',
  onDesignVoice,
  createPreferredName = (index) => createVoiceDesignPreferredName(index),
}: GenerateVoiceDesignOptionsParams): Promise<GeneratedVoice[]> {
  const trimmedPrompt = voicePrompt.trim()
  if (!trimmedPrompt) throw new Error('VOICE_PROMPT_REQUIRED')

  const resolvedPreviewText = previewText.trim() || defaultPreviewText
  const resolvedCount = normalizeVoiceSchemeCount(count)
  const voices: GeneratedVoice[] = []

  for (let index = 0; index < resolvedCount; index += 1) {
    const result = await onDesignVoice({
      voicePrompt: trimmedPrompt,
      previewText: resolvedPreviewText,
      preferredName: createPreferredName(index),
      language,
    })

    if (!result.audioBase64) continue
    if (typeof result.voiceId !== 'string' || result.voiceId.length === 0) {
      throw new Error('VOICE_DESIGN_INVALID_RESPONSE: missing voiceId')
    }

    voices.push({
      voiceId: result.voiceId,
      audioBase64: result.audioBase64,
      audioUrl: `data:audio/wav;base64,${result.audioBase64}`,
    })
  }

  if (voices.length === 0) throw new Error('VOICE_DESIGN_EMPTY_RESULT')

  return voices
}
