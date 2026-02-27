export type AnyObj = Record<string, unknown>

export function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function stripMarkdownCodeFence(input: string): string {
  return input
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/\s*```$/g, '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
}

function escapeControlCharsInJsonStrings(input: string): string {
  let out = ''
  let inString = false
  let escaped = false

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]

    if (!inString) {
      if (ch === '"') inString = true
      out += ch
      continue
    }

    if (escaped) {
      out += ch
      escaped = false
      continue
    }

    if (ch === '\\') {
      out += ch
      escaped = true
      continue
    }

    if (ch === '"') {
      inString = false
      out += ch
      continue
    }

    if (ch === '\n') {
      out += '\\n'
      continue
    }
    if (ch === '\r') {
      out += '\\r'
      continue
    }
    if (ch === '\t') {
      out += '\\t'
      continue
    }

    const code = ch.charCodeAt(0)
    if (code >= 0 && code < 0x20) {
      out += `\\u${code.toString(16).padStart(4, '0')}`
      continue
    }

    out += ch
  }

  return out
}

export function parseScreenplayPayload(responseText: string): AnyObj {
  const cleaned = stripMarkdownCodeFence(responseText.trim())
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('AI returned invalid screenplay JSON')
  }

  const jsonText = cleaned.substring(firstBrace, lastBrace + 1)
  try {
    const parsed = JSON.parse(jsonText)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('AI returned invalid screenplay JSON object')
    }
    return parsed as AnyObj
  } catch {
    const repaired = escapeControlCharsInJsonStrings(jsonText)
    const parsed = JSON.parse(repaired)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('AI returned invalid screenplay JSON object')
    }
    return parsed as AnyObj
  }
}
