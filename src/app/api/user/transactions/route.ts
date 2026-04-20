import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

export const GET = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const { searchParams } = new URL(request.url)
  const page = searchParams.get('page') ?? undefined
  const pageSize = searchParams.get('pageSize') ?? undefined
  const type = searchParams.get('type') ?? undefined
  const startDate = searchParams.get('startDate') ?? undefined
  const endDate = searchParams.get('endDate') ?? undefined

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'list_user_transactions',
    projectId: 'system',
    userId: session.user.id,
    input: {
      ...(page !== undefined ? { page } : {}),
      ...(pageSize !== undefined ? { pageSize } : {}),
      ...(type !== undefined ? { type } : {}),
      ...(startDate !== undefined ? { startDate } : {}),
      ...(endDate !== undefined ? { endDate } : {}),
    },
    source: 'user',
  })

  return NextResponse.json(result)
})

