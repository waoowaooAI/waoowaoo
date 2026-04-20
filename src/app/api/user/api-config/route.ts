import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

export const GET = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'get_user_api_config',
    projectId: 'system',
    userId: session.user.id,
    input: {},
    source: 'user',
  })

  return NextResponse.json(result)
})

export const PUT = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

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
    operationId: 'put_user_api_config',
    projectId: 'system',
    userId: session.user.id,
    input: body,
    source: 'user',
  })

  return NextResponse.json(result)
})

