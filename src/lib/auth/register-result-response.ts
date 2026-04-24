import {
  isAuthRegisterResultCode,
  type AuthRegisterResultCode,
} from '@/lib/auth/register-result-codes'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readNestedRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(value)) return null
  const nested = value[key]
  return isRecord(nested) ? nested : null
}

export function readAuthRegisterResultCode(payload: unknown): AuthRegisterResultCode | null {
  if (!isRecord(payload)) return null

  const details = readNestedRecord(readNestedRecord(payload, 'error'), 'details')
  if (details && isAuthRegisterResultCode(details.code)) return details.code

  if (isAuthRegisterResultCode(payload.code)) return payload.code
  if (isAuthRegisterResultCode(payload.message)) return payload.message

  return null
}
