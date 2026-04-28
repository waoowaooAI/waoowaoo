import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import {
  createUserStylePreset,
  listUserStylePresets,
  stylePresetKindSchema,
} from '@/lib/style-preset'

export const GET = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const rawKind = new URL(request.url).searchParams.get('kind')
  const parsedKind = rawKind ? stylePresetKindSchema.safeParse(rawKind) : null
  if (rawKind && !parsedKind?.success) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'STYLE_PRESET_KIND_INVALID',
      field: 'kind',
    })
  }

  const result = await listUserStylePresets({
    userId: authResult.session.user.id,
    ...(parsedKind?.success ? { kind: parsedKind.data } : {}),
  })
  return NextResponse.json(result)
})

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

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

  const result = await createUserStylePreset({
    userId: authResult.session.user.id,
    input: body,
  })
  return NextResponse.json(result, { status: 201 })
})
