import type { UIMessage } from 'ai'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function isPersistableUIMessages(messages: unknown): messages is UIMessage[] {
  if (!Array.isArray(messages)) return false
  return messages.every((message) => {
    if (!isRecord(message)) return false
    if (!isNonEmptyString(message.id)) return false
    if (!isNonEmptyString(message.role)) return false
    if (!Array.isArray(message.parts)) return false
    if (message.parts.length === 0) return false
    return true
  })
}

