import { GoogleGenAI } from '@google/genai'
import { getProviderConfig } from '@/lib/user-api/runtime-config'
import type { AiProviderMusicExecutionContext, GenerateResult } from '@/lib/ai-providers/runtime-types'
import { requireSelectedModelId } from '@/lib/ai-providers/shared/model-selection'
import { setProxy } from '../../../../lib/prompts/proxy'

type GoogleMusicOptions = NonNullable<AiProviderMusicExecutionContext['options']>

interface GoogleMusicPart {
  inlineData?: {
    data?: string
    mimeType?: string
  }
  text?: string
}

interface GoogleMusicResponse {
  candidates?: Array<{
    content?: {
      parts?: GoogleMusicPart[]
    }
    finishReason?: string
  }>
}

function trim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function buildMusicPrompt(prompt: string, options: GoogleMusicOptions): string {
  const lines = [prompt.trim()]
  const genre = trim(options.genre)
  const mood = trim(options.mood)

  if (genre) lines.push(`Genre: ${genre}`)
  if (mood) lines.push(`Mood: ${mood}`)
  if (typeof options.durationSeconds === 'number') lines.push(`Target duration: ${options.durationSeconds} seconds`)
  if (typeof options.bpm === 'number') lines.push(`BPM: ${options.bpm}`)
  if (options.vocalMode === 'instrumental') lines.push('Instrumental only. Do not include vocals or lyrics.')
  if (options.vocalMode === 'vocal') lines.push('Vocals are allowed when musically appropriate.')
  if (options.outputFormat) lines.push(`Requested output format: ${options.outputFormat}`)

  return lines.join('\n')
}

function getFinishReason(response: GoogleMusicResponse): string | undefined {
  return response.candidates?.[0]?.finishReason
}

function isSafetyFinishReason(reason: string | undefined): boolean {
  return reason === 'SAFETY'
    || reason === 'PROHIBITED_CONTENT'
    || reason === 'BLOCKLIST'
    || reason === 'RECITATION'
}

export function extractGoogleMusicResult(response: unknown): {
  audioBase64: string
  audioMimeType: string
  textMetadata: string
  finishReason?: string
} {
  const safe = response && typeof response === 'object' ? response as GoogleMusicResponse : {}
  const parts = safe.candidates?.[0]?.content?.parts || []
  const textParts: string[] = []
  let audioBase64 = ''
  let audioMimeType = ''

  for (const part of parts) {
    const text = trim(part.text)
    if (text) textParts.push(text)

    const mimeType = trim(part.inlineData?.mimeType)
    const data = trim(part.inlineData?.data)
    if (!audioBase64 && data && mimeType.startsWith('audio/')) {
      audioBase64 = data
      audioMimeType = mimeType
    }
  }

  if (audioBase64) {
    return {
      audioBase64,
      audioMimeType,
      textMetadata: textParts.join('\n\n'),
      finishReason: getFinishReason(safe),
    }
  }

  const finishReason = getFinishReason(safe)
  if (isSafetyFinishReason(finishReason)) {
    throw new Error(`GOOGLE_MUSIC_BLOCKED:${finishReason}`)
  }
  throw new Error('GOOGLE_MUSIC_EMPTY_RESPONSE: no audio inlineData returned')
}

export async function executeGoogleMusicGeneration(input: AiProviderMusicExecutionContext): Promise<GenerateResult> {
  const options = input.options ?? {}
  const { apiKey } = await getProviderConfig(input.userId, input.selection.provider)
  await setProxy()
  const ai = new GoogleGenAI({ apiKey })
  const modelId = requireSelectedModelId(input.selection, 'google:music')

  const response = await ai.models.generateContent({
    model: modelId,
    contents: [{ parts: [{ text: buildMusicPrompt(input.prompt, options) }] }],
  })

  const result = extractGoogleMusicResult(response)
  return {
    success: true,
    audioBase64: result.audioBase64,
    audioMimeType: result.audioMimeType,
    audioUrl: `data:${result.audioMimeType};base64,${result.audioBase64}`,
    metadata: {
      ...(result.textMetadata ? { text: result.textMetadata } : {}),
      ...(result.finishReason ? { finishReason: result.finishReason } : {}),
      model: modelId,
    },
  }
}
