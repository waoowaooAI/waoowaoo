import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import {
  archiveUserStylePreset,
  updateUserStylePreset,
} from '@/lib/style-preset'

export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ presetId: string }> },
) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { presetId } = await context.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new ApiError('INVALID_PARAMS', {
      code: 'BODY_PARSE_FAILED',
      field: 'body',
      message: 'request body must be valid JSON',
    })
  }

  const result = await updateUserStylePreset({
    userId: authResult.session.user.id,
    presetId,
    input: body,
  })
  return NextResponse.json(result)
})

export const DELETE = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ presetId: string }> },
) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { presetId } = await context.params

  const result = await archiveUserStylePreset({
    userId: authResult.session.user.id,
    presetId,
  })
  return NextResponse.json(result)
})
