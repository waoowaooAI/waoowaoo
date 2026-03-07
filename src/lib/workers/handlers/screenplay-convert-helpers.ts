import { safeParseJsonObject } from '@/lib/json-repair'

export type AnyObj = Record<string, unknown>

export function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function parseScreenplayPayload(responseText: string): AnyObj {
  const parsed = safeParseJsonObject(responseText)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AI returned invalid screenplay JSON object')
  }
  return parsed as AnyObj
}

