import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ folderId: string }> }
) => {
  const { folderId } = await context.params

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
    operationId: 'asset_hub_update_folder',
    projectId: 'global-asset-hub',
    userId: session.user.id,
    input: {
      ...(body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}),
      folderId,
    },
    source: 'asset-hub',
  })

  return NextResponse.json(result)
})

export const DELETE = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ folderId: string }> }
) => {
  const { folderId } = await context.params

  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'asset_hub_delete_folder',
    projectId: 'global-asset-hub',
    userId: session.user.id,
    input: { folderId },
    source: 'asset-hub',
  })

  return NextResponse.json(result)
})

