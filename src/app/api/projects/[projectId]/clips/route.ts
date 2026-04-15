import { NextRequest } from 'next/server'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { TASK_TYPE } from '@/lib/task/types'
import { maybeSubmitLLMTask } from '@/lib/llm-observe/route-task'

/**
 * POST /api/projects/[projectId]/clips
 * 生成 clips（第二步：片段切分）
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const body = await request.json().catch(() => ({}))
  const episodeId = typeof body?.episodeId === 'string' ? body.episodeId.trim() : ''

  if (!episodeId) {
    throw new ApiError('INVALID_PARAMS')
  }

  const authResult = await requireProjectAuth(projectId, {
    include: { characters: true, locations: true },
  })
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const asyncTaskResponse = await maybeSubmitLLMTask({
    request,
    userId: session.user.id,
    projectId,
    episodeId,
    type: TASK_TYPE.CLIPS_BUILD,
    targetType: 'ProjectEpisode',
    targetId: episodeId,
    routePath: `/api/projects/${projectId}/clips`,
    body: {
      ...body,
      displayMode: 'detail',
    },
    dedupeKey: `clips_build:${episodeId}`,
    priority: 1,
  })
  if (asyncTaskResponse) return asyncTaskResponse

  throw new ApiError('INVALID_PARAMS')
})
