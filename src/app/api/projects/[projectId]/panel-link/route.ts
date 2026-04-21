import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

// POST - 更新 panel 的首尾帧链接状态
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const { storyboardId, panelIndex, linked } = body

  if (!storyboardId || panelIndex === undefined || linked === undefined) {
    throw new ApiError('INVALID_PARAMS')
  }

  await executeProjectAgentOperationFromApi({
    request,
    operationId: 'update_storyboard_panel_fields',
    projectId,
    userId: authResult.session.user.id,
    input: {
      storyboardId,
      panelIndex: Number(panelIndex),
      linkedToNextPanel: linked === true,
    },
    source: 'project-ui',
  })

  return NextResponse.json({ success: true })
})
