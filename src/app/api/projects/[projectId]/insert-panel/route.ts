import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { resolveTaskLocale } from '@/lib/task/resolve-locale'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const storyboardId = body?.storyboardId
  const insertAfterPanelId = body?.insertAfterPanelId

  if (!storyboardId || !insertAfterPanelId) {
    throw new ApiError('INVALID_PARAMS')
  }

  const locale = resolveTaskLocale(request, body)

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'insert_storyboard_panel',
    projectId,
    userId: authResult.session.user.id,
    context: {
      locale,
    },
    input: {
      storyboardId,
      insertAfterPanelId,
      ...body,
    },
    source: 'project-ui',
  })

  return NextResponse.json(result)
})
