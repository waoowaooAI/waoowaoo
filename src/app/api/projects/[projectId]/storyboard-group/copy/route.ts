import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const sourceStoryboardId = typeof body.sourceStoryboardId === 'string' ? body.sourceStoryboardId.trim() : ''
  if (!sourceStoryboardId) {
    throw new ApiError('INVALID_PARAMS')
  }

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'copy_storyboard_group',
    projectId,
    userId: authResult.session.user.id,
    input: {
      sourceStoryboardId,
      ...(typeof body.insertIndex === 'number' ? { insertIndex: body.insertIndex } : {}),
      ...(typeof body.includeImages === 'boolean' ? { includeImages: body.includeImages } : {}),
    },
    source: 'project-ui',
  })

  return NextResponse.json(result)
})
