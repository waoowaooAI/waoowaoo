import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

export const GET = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'get_user_costs',
    projectId: 'system',
    userId: session.user.id,
    input: {},
    source: 'user',
  })

  return NextResponse.json(result)
})

