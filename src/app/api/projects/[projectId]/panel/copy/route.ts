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
  const sourcePanelId = typeof body.sourcePanelId === 'string' ? body.sourcePanelId.trim() : ''
  const insertAfterPanelId = typeof body.insertAfterPanelId === 'string'
    ? body.insertAfterPanelId.trim()
    : ''
  if (!sourcePanelId) {
    throw new ApiError('INVALID_PARAMS')
  }

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'copy_storyboard_panel',
    projectId,
    userId: authResult.session.user.id,
    input: {
      sourcePanelId,
      ...(insertAfterPanelId ? { insertAfterPanelId } : {}),
      ...(typeof body.includeImages === 'boolean' ? { includeImages: body.includeImages } : {}),
    },
    source: 'project-ui',
  })

  return NextResponse.json(result)
})
