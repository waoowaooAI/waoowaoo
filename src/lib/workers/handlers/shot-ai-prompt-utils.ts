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
  let cleaned = responseText.trim()
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '')
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) {
    throw new Error('No JSON object found in response')
  }
  return JSON.parse(match[0]) as AnyObj
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

  let cleaned = responseText.trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('No JSON found in response')
  }
  cleaned = jsonMatch[0]
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/,(\s*[}\]])/g, '$1')
  const parsed = JSON.parse(cleaned) as AnyObj
  if (typeof parsed.image_prompt === 'string' && parsed.image_prompt.trim()) {
    return {
      imagePrompt: parsed.image_prompt.trim(),
      videoPrompt: typeof parsed.video_prompt === 'string' ? parsed.video_prompt.trim() : '',
    }
  }
  if (typeof parsed.prompt === 'string' && parsed.prompt.trim()) {
    return {
      imagePrompt: parsed.prompt.trim(),
      videoPrompt: '',
    }
  }
  throw new Error('Invalid shot prompt response')
}
