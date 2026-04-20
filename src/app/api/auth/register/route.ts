import { NextRequest, NextResponse } from 'next/server'
import { logAuthAction } from '@/lib/logging/semantic'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { checkRateLimit, getClientIp, AUTH_REGISTER_LIMIT } from '@/lib/rate-limit'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

export const POST = apiHandler(async (request: NextRequest) => {
  // 🛡️ IP 限流
  const ip = getClientIp(request)
  const rateResult = await checkRateLimit('auth:register', ip, AUTH_REGISTER_LIMIT)
  if (rateResult.limited) {
    logAuthAction('REGISTER', 'unknown', { error: 'Rate limited', ip })
    return NextResponse.json(
      { success: false, message: `请求过于频繁，请 ${rateResult.retryAfterSeconds} 秒后再试` },
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
      code: 'BODY_PARSE_FAILED',
      field: 'body',
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
