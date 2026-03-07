import { NextRequest } from 'next/server'
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
  const { session, project } = authResult

  const body = await request.json().catch(() => ({}))
  const currentPrompt = typeof body?.currentPrompt === 'string' ? body.currentPrompt.trim() : ''
  const modifyInstruction = typeof body?.modifyInstruction === 'string' ? body.modifyInstruction.trim() : ''
  if (!currentPrompt || !modifyInstruction) {
    throw new ApiError('INVALID_PARAMS')
  }
  if (project.mode !== 'novel-promotion') {
    throw new ApiError('INVALID_PARAMS')
  }

  const panelId = typeof body?.panelId === 'string' ? body.panelId.trim() : ''
  const episodeId = typeof body?.episodeId === 'string' ? body.episodeId.trim() : ''

  const asyncTaskResponse = await maybeSubmitLLMTask({
    request,
    userId: session.user.id,
    projectId,
    episodeId: episodeId || null,
    type: TASK_TYPE.AI_MODIFY_SHOT_PROMPT,
    targetType: panelId ? 'NovelPromotionPanel' : 'NovelPromotionProject',
    targetId: panelId || projectId,
    routePath: `/api/novel-promotion/${projectId}/ai-modify-shot-prompt`,
    body,
    dedupeKey: panelId ? `ai_modify_shot_prompt:${panelId}` : `ai_modify_shot_prompt:${projectId}`})
  if (asyncTaskResponse) return asyncTaskResponse

  throw new ApiError('INVALID_PARAMS')
})
