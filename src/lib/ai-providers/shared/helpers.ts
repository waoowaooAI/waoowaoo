export type UnknownObject = { [key: string]: unknown }

export function asUnknownObject(value: unknown): UnknownObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownObject) : null
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  const record = asUnknownObject(error)
  if (record && typeof record.message === 'string') return record.message
  return String(error)
}

