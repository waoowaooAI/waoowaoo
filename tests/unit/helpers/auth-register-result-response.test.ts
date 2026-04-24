import { describe, expect, it } from 'vitest'
import { AUTH_REGISTER_RESULT_CODES } from '@/lib/auth/register-result-codes'
import { readAuthRegisterResultCode } from '@/lib/auth/register-result-response'

describe('readAuthRegisterResultCode', () => {
  it('[apiHandler error payload] -> reads auth register code from error details', () => {
    expect(
      readAuthRegisterResultCode({
        error: {
          code: 'CONFLICT',
          details: {
            code: AUTH_REGISTER_RESULT_CODES.userExists,
          },
        },
        code: 'CONFLICT',
        message: 'CONFLICT',
      }),
    ).toBe(AUTH_REGISTER_RESULT_CODES.userExists)
  })

  it('[rate limit payload] -> reads auth register code from flattened code', () => {
    expect(
      readAuthRegisterResultCode({
        success: false,
        code: AUTH_REGISTER_RESULT_CODES.rateLimited,
        message: AUTH_REGISTER_RESULT_CODES.rateLimited,
      }),
    ).toBe(AUTH_REGISTER_RESULT_CODES.rateLimited)
  })

  it('[unknown payload] -> returns null instead of exposing raw message', () => {
    expect(readAuthRegisterResultCode({ message: 'Invalid parameters' })).toBeNull()
  })
})
