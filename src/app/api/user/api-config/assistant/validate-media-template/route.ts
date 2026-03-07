import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { getProviderKey } from '@/lib/api-config'
import { validateOpenAICompatMediaTemplate } from '@/lib/user-api/model-template'

type RequestBody = {
  providerId?: unknown
  template?: unknown
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_TEMPLATE_INVALID',
      field,
    })
  }
  return value.trim()
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
    })
  }

  const providerId = readRequiredString(body.providerId, 'providerId')
  if (getProviderKey(providerId) !== 'openai-compatible') {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_TEMPLATE_PROVIDER_INVALID',
      field: 'providerId',
    })
  }

  const result = validateOpenAICompatMediaTemplate(body.template)
  return NextResponse.json({
    success: result.ok,
    ...(result.template ? { template: result.template } : {}),
    issues: result.issues,
  })
})

