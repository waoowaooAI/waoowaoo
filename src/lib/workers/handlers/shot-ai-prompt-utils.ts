import { safeParseJsonObject } from '@/lib/json-repair'

export type AnyObj = Record<string, unknown>

export function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function readRequiredString(value: unknown, field: string): string {
  const text = readText(value).trim()
  if (!text) {
    throw new Error(`${field} is required`)
  }
  return text
}

export function parseJsonObject(responseText: string): AnyObj {
  return safeParseJsonObject(responseText) as AnyObj
}

export function parseShotPromptResponse(responseText: string): {
  imagePrompt: string
  videoPrompt: string
} {
  try {
    const direct = parseJsonObject(responseText)
    if (typeof direct.image_prompt === 'string' && direct.image_prompt.trim()) {
      return {
        imagePrompt: direct.image_prompt.trim(),
        videoPrompt: typeof direct.video_prompt === 'string' ? direct.video_prompt.trim() : '',
      }
    }
    if (typeof direct.prompt === 'string' && direct.prompt.trim()) {
      return {
        imagePrompt: direct.prompt.trim(),
        videoPrompt: '',
      }
    }
  } catch {
    // fall through
  }
  throw new Error('Invalid shot prompt response')
}
