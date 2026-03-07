const MAX_DEPTH = 6

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value == null) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function shouldRedact(key: string, redactKeys: string[]): boolean {
  const lower = key.toLowerCase()
  return redactKeys.some((needle) => lower.includes(needle))
}

export function redactValue(value: unknown, redactKeys: string[], depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[MaxDepth]'
  if (value == null) return value

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, redactKeys, depth + 1))
  }

  if (isPlainObject(value)) {
    const output: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value)) {
      if (shouldRedact(key, redactKeys)) {
        output[key] = '[REDACTED]'
      } else {
        output[key] = redactValue(nested, redactKeys, depth + 1)
      }
    }
    return output
  }

  return value
}
