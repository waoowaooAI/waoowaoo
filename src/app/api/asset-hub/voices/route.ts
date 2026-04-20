import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

export const GET = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const { searchParams } = new URL(request.url)
  const folderId = searchParams.get('folderId') ?? undefined

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'asset_hub_list_voices',
    projectId: 'global-asset-hub',
    userId: session.user.id,
    input: { ...(folderId !== undefined ? { folderId } : {}) },
    source: 'asset-hub',
  })

  return NextResponse.json(result)
})

export const POST = apiHandler(async (request: NextRequest) => {
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
      message: 'request body must be valid JSON',
    })
  }

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'asset_hub_create_voice',
    projectId: 'global-asset-hub',
    userId: session.user.id,
    input: body,
    source: 'asset-hub',
  })

  return NextResponse.json(result)
})

