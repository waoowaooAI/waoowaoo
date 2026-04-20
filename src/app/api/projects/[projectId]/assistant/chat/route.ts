import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuth } from '@/lib/api-auth'
import { createProjectAgentChatResponse } from '@/lib/project-agent'
import {
  clearProjectAssistantThread,
  loadProjectAssistantThread,
  saveProjectAssistantThread,
} from '@/lib/project-agent/persistence'

type RequestBody = {
  messages?: unknown
  context?: unknown
  episodeId?: string | null
}

function mapProjectAgentError(error: unknown): ApiError {
  if (error instanceof Error) {
    if (error.message === 'PROJECT_AGENT_MODEL_NOT_CONFIGURED') {
      return new ApiError('MISSING_CONFIG', {
        code: error.message,
        message: 'analysisModel is required before using project assistant',
      })
    }
    if (
      error.message === 'PROJECT_AGENT_INVALID_MESSAGES'
      || error.message === 'PROJECT_AGENT_EMPTY_MESSAGES'
      || error.message === 'PROJECT_AGENT_EPISODE_REQUIRED'
      || error.message === 'PROJECT_ASSISTANT_INVALID_THREAD_MESSAGES'
      || error.message === 'PROJECT_AGENT_TOOL_SELECTION_INVALID'
      || error.message === 'PROJECT_AGENT_TOOL_SELECTION_TOO_LARGE'
    ) {
      return new ApiError('INVALID_PARAMS', {
        code: error.message,
        message: error.message,
      })
    }
  }

  return new ApiError('EXTERNAL_ERROR', {
    code: 'PROJECT_AGENT_RUNTIME_FAILED',
    message: error instanceof Error ? error.message : String(error),
  })
}

function readEpisodeIdFromQuery(request: NextRequest): string | null {
  return request.nextUrl.searchParams.get('episodeId')?.trim() || null
}

function readEpisodeIdFromBody(body: RequestBody): string | null {
  return typeof body.episodeId === 'string' && body.episodeId.trim()
    ? body.episodeId.trim()
    : null
}

export const runtime = 'nodejs'

export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  try {
    const thread = await loadProjectAssistantThread({
      projectId,
      userId: authResult.session.user.id,
      episodeId: readEpisodeIdFromQuery(request),
      assistantId: 'workspace-command',
    })
    return NextResponse.json({ thread })
  } catch (error) {
    throw mapProjectAgentError(error)
  }
})

export const PUT = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    throw new ApiError('INVALID_PARAMS', {
      code: 'BODY_PARSE_FAILED',
      field: 'body',
      message: 'request body must be valid JSON',
    })
  }

  try {
    const thread = await saveProjectAssistantThread({
      projectId,
      userId: authResult.session.user.id,
      episodeId: readEpisodeIdFromBody(body),
      assistantId: 'workspace-command',
      messages: body.messages ?? [],
    })
    return NextResponse.json({ thread })
  } catch (error) {
    throw mapProjectAgentError(error)
  }
})

export const DELETE = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  try {
    await clearProjectAssistantThread({
      projectId,
      userId: authResult.session.user.id,
      episodeId: readEpisodeIdFromQuery(request),
      assistantId: 'workspace-command',
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    throw mapProjectAgentError(error)
  }
})

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    throw new ApiError('INVALID_PARAMS', {
      code: 'BODY_PARSE_FAILED',
      field: 'body',
      message: 'request body must be valid JSON',
    })
  }

  try {
    return await createProjectAgentChatResponse({
      request,
      userId: authResult.session.user.id,
      projectId,
      context: body.context,
      messages: body.messages,
    })
  } catch (error) {
    throw mapProjectAgentError(error)
  }
})
