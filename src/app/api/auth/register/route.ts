import { NextRequest, NextResponse } from 'next/server'
import { logAuthAction } from '@/lib/logging/semantic'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { checkRateLimit, getClientIp, AUTH_REGISTER_LIMIT } from '@/lib/rate-limit'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'
import { AUTH_REGISTER_RESULT_CODES } from '@/lib/auth/register-result-codes'

export const POST = apiHandler(async (request: NextRequest) => {
  // 🛡️ IP 限流
  const ip = getClientIp(request)
  const rateResult = await checkRateLimit('auth:register', ip, AUTH_REGISTER_LIMIT)
  if (rateResult.limited) {
    logAuthAction('REGISTER', 'unknown', { error: 'Rate limited', ip })
    return NextResponse.json(
      {
        success: false,
        code: AUTH_REGISTER_RESULT_CODES.rateLimited,
        message: AUTH_REGISTER_RESULT_CODES.rateLimited,
        retryAfterSeconds: rateResult.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(rateResult.retryAfterSeconds) },
      },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new ApiError('INVALID_PARAMS', {
      code: AUTH_REGISTER_RESULT_CODES.bodyParseFailed,
      field: 'body',
      message: AUTH_REGISTER_RESULT_CODES.bodyParseFailed,
    })
  }

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'auth_register_user',
    projectId: 'system',
    userId: 'anonymous',
    input: body,
    source: 'auth',
  })

  return NextResponse.json(
    result,
    { status: 201 }
  )
})
