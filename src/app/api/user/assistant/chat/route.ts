import { NextRequest } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import {
  AssistantPlatformError,
  createAssistantChatResponse,
  isAssistantId,
} from '@/lib/assistant-platform'

type RequestBody = {
  assistantId?: unknown
  messages?: unknown
  context?: unknown
}

function readAssistantId(value: unknown): 'api-config-template' | 'tutorial' {
  if (!isAssistantId(value)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'ASSISTANT_INVALID_REQUEST',
      field: 'assistantId',
      message: 'assistantId must be api-config-template or tutorial',
    })
  }
  return value
}

function mapAssistantError(error: AssistantPlatformError): ApiError {
  if (error.code === 'ASSISTANT_MODEL_NOT_CONFIGURED') {
    return new ApiError('MISSING_CONFIG', {
      code: error.code,
      message: 'analysisModel is required before using assistant',
    })
  }

  if (error.code === 'ASSISTANT_INVALID_REQUEST' || error.code === 'ASSISTANT_CONTEXT_REQUIRED') {
    return new ApiError('INVALID_PARAMS', {
      code: error.code,
      message: error.message,
    })
  }

  if (error.code === 'ASSISTANT_SKILL_NOT_FOUND') {
    return new ApiError('INVALID_PARAMS', {
      code: error.code,
      message: error.message,
    })
  }

  return new ApiError('EXTERNAL_ERROR', {
    code: error.code,
    message: error.message,
  })
}

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
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

  const assistantId = readAssistantId(body.assistantId)

  try {
    return await createAssistantChatResponse({
      userId: authResult.session.user.id,
      assistantId,
      context: body.context,
      messages: body.messages,
    })
  } catch (error) {
    if (error instanceof AssistantPlatformError) {
      throw mapAssistantError(error)
    }
    throw error
  }
})
