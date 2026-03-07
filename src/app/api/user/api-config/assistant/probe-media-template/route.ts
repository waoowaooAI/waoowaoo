import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { getProviderKey } from '@/lib/api-config'
import { validateOpenAICompatMediaTemplate } from '@/lib/user-api/model-template'
import { probeMediaTemplate } from '@/lib/user-api/model-template/probe'

type RequestBody = {
  providerId?: unknown
  modelId?: unknown
  template?: unknown
  samplePrompt?: unknown
  sampleImage?: unknown
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_TEMPLATE_PROBE_INVALID',
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
  const modelId = readRequiredString(body.modelId, 'modelId')
  if (getProviderKey(providerId) !== 'openai-compatible') {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_TEMPLATE_PROBE_PROVIDER_INVALID',
      field: 'providerId',
    })
  }

  const validated = validateOpenAICompatMediaTemplate(body.template)
  if (!validated.ok || !validated.template) {
    return NextResponse.json({
      success: false,
      verified: false,
      code: 'MODEL_TEMPLATE_INVALID',
      issues: validated.issues,
    })
  }

  const samplePrompt = typeof body.samplePrompt === 'string' ? body.samplePrompt.trim() : undefined
  const sampleImage = typeof body.sampleImage === 'string' ? body.sampleImage.trim() : undefined

  const result = await probeMediaTemplate({
    userId: authResult.session.user.id,
    providerId,
    modelId,
    template: validated.template,
    ...(samplePrompt ? { samplePrompt } : {}),
    ...(sampleImage ? { sampleImage } : {}),
  })

  return NextResponse.json(result)
})

