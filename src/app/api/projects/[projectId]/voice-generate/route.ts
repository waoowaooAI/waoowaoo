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

  const body = await request.json().catch(() => null)
  const episodeId = typeof body?.episodeId === 'string' ? body.episodeId : ''
  const lineId = typeof body?.lineId === 'string' ? body.lineId : undefined
  const all = body?.all === true
  const audioModel = typeof body?.audioModel === 'string' ? body.audioModel.trim() : undefined

  if (!episodeId) {
    throw new ApiError('INVALID_PARAMS')
  }
  if (!all && !lineId) {
    throw new ApiError('INVALID_PARAMS')
  }

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: all ? 'generate_episode_voice_audio' : 'generate_voice_line_audio',
    projectId,
    userId: authResult.session.user.id,
    context: {
      episodeId,
    },
    input: {
      episodeId,
      ...(lineId ? { lineId } : {}),
      ...(all ? { all: true } : {}),
      ...(audioModel ? { audioModel } : {}),
    },
    source: 'project-ui',
  })

  return NextResponse.json(result)
})
