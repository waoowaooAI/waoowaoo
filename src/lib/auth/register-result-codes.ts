export const AUTH_REGISTER_RESULT_CODES = {
  success: 'AUTH_REGISTER_SUCCESS',
  invalidPayload: 'AUTH_REGISTER_INVALID_PAYLOAD',
  missingName: 'AUTH_REGISTER_MISSING_NAME',
  missingPassword: 'AUTH_REGISTER_MISSING_PASSWORD',
  passwordTooShort: 'AUTH_REGISTER_PASSWORD_TOO_SHORT',
  userExists: 'AUTH_REGISTER_USER_EXISTS',
  bodyParseFailed: 'AUTH_REGISTER_BODY_PARSE_FAILED',
  rateLimited: 'AUTH_RATE_LIMITED',
} as const

export type AuthRegisterResultCode =
  (typeof AUTH_REGISTER_RESULT_CODES)[keyof typeof AUTH_REGISTER_RESULT_CODES]

const AUTH_REGISTER_RESULT_CODE_VALUES = new Set<string>(
  Object.values(AUTH_REGISTER_RESULT_CODES),
)

export function isAuthRegisterResultCode(value: unknown): value is AuthRegisterResultCode {
  return typeof value === 'string' && AUTH_REGISTER_RESULT_CODE_VALUES.has(value)
}
