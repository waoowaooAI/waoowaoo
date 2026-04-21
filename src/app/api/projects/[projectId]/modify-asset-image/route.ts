import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return {}
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = toObject(await request.json().catch(() => ({})))
  const type = body.type
  if (type !== 'character' && type !== 'location') {
    throw new ApiError('INVALID_PARAMS')
  }

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: type === 'character' ? 'modify_character_image' : 'modify_location_image',
    projectId,
    userId: authResult.session.user.id,
    input: body,
    source: 'project-ui',
  })

  return NextResponse.json(result)
})
