import { createHash } from 'crypto'
import { NextRequest } from 'next/server'
import { getProjectModelConfig } from '@/lib/config-service'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { TASK_TYPE } from '@/lib/task/types'
import { maybeSubmitLLMTask } from '@/lib/llm-observe/route-task'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const userInstruction = typeof body.userInstruction === 'string' ? body.userInstruction.trim() : ''
  if (!userInstruction) {
    throw new ApiError('INVALID_PARAMS')
  }

  const modelConfig = await getProjectModelConfig(projectId, session.user.id)
  if (!modelConfig.analysisModel) {
    throw new ApiError('MISSING_CONFIG')
  }

  const dedupeDigest = createHash('sha1')
    .update(`${projectId}:${session.user.id}:character:${userInstruction}`)
    .digest('hex')
    .slice(0, 16)

  const payload = {
    userInstruction,
    analysisModel: modelConfig.analysisModel,
    displayMode: 'detail' as const}

  const asyncTaskResponse = await maybeSubmitLLMTask({
    request,
    userId: session.user.id,
    projectId,
    type: TASK_TYPE.AI_CREATE_CHARACTER,
    targetType: 'NovelPromotionCharacterDesign',
    targetId: projectId,
    routePath: `/api/novel-promotion/${projectId}/ai-create-character`,
    body: payload,
    dedupeKey: `novel_promotion_ai_create_character:${dedupeDigest}`})
  if (asyncTaskResponse) return asyncTaskResponse

  throw new ApiError('INVALID_PARAMS')
})
