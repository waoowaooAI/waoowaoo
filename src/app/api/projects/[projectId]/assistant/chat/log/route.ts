import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuth } from '@/lib/api-auth'
import { loadProjectAssistantThread } from '@/lib/project-agent/persistence'
import {
  buildWorkspaceAssistantThreadLogFileName,
  serializeWorkspaceAssistantThreadLog,
} from '@/lib/project-agent/thread-log'

export const runtime = 'nodejs'

function readEpisodeIdFromQuery(request: NextRequest): string | null {
  return request.nextUrl.searchParams.get('episodeId')?.trim() || null
}

export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  const thread = await loadProjectAssistantThread({
    projectId,
    userId: authResult.session.user.id,
    episodeId: readEpisodeIdFromQuery(request),
    assistantId: 'workspace-command',
  })

  if (!thread) {
    throw new ApiError('NOT_FOUND', {
      code: 'PROJECT_ASSISTANT_THREAD_NOT_FOUND',
      message: 'workspace assistant thread not found',
    })
  }

  const body = serializeWorkspaceAssistantThreadLog({ thread })
  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'content-disposition': `attachment; filename="${buildWorkspaceAssistantThreadLogFileName(thread)}"`,
    },
  })
})
