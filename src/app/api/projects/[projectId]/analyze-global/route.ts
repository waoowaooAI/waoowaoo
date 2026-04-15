import { NextRequest } from 'next/server'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { TASK_TYPE } from '@/lib/task/types'
import { maybeSubmitLLMTask } from '@/lib/llm-observe/route-task'

/**
 * 全局资产分析（任务化）
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult
  const body = await request.json().catch(() => ({}))

  const asyncTaskResponse = await maybeSubmitLLMTask({
    request,
    userId: session.user.id,
    projectId,
    type: TASK_TYPE.ANALYZE_GLOBAL,
    targetType: 'Project',
    targetId: projectId,
    routePath: `/api/projects/${projectId}/analyze-global`,
    body,
    dedupeKey: `analyze_global:${projectId}`})
  if (asyncTaskResponse) return asyncTaskResponse

  throw new ApiError('INVALID_PARAMS')
})
