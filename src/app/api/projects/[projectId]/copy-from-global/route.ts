import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { copyAssetFromGlobal } from '@/lib/assets/services/asset-actions'

type LegacyCopyBody = {
  type?: 'character' | 'location' | 'voice'
  targetId?: string
  globalAssetId?: string
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json() as LegacyCopyBody
  if (
    (body.type !== 'character' && body.type !== 'location' && body.type !== 'voice')
    || typeof body.targetId !== 'string'
    || body.targetId.trim().length === 0
    || typeof body.globalAssetId !== 'string'
    || body.globalAssetId.trim().length === 0
  ) {
    throw new ApiError('INVALID_PARAMS')
  }

  const result = await copyAssetFromGlobal({
    kind: body.type,
    targetId: body.targetId,
    globalAssetId: body.globalAssetId,
    access: {
      userId: authResult.session.user.id,
      projectId,
    },
  })

  return NextResponse.json(result)
})
