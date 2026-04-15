import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { submitAssetModifyTask } from '@/lib/assets/services/asset-actions'

type LegacyProjectModifyBody = Record<string, unknown> & {
  type?: 'character' | 'location'
  characterId?: string
  locationId?: string
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json() as LegacyProjectModifyBody
  const assetId = body.type === 'character'
    ? body.characterId
    : body.type === 'location'
      ? body.locationId
      : null
  if ((body.type !== 'character' && body.type !== 'location') || typeof assetId !== 'string' || assetId.trim().length === 0) {
    throw new ApiError('INVALID_PARAMS')
  }

  const result = await submitAssetModifyTask({
    request,
    kind: body.type,
    assetId,
    body,
    access: {
      scope: 'project',
      userId: authResult.session.user.id,
      projectId,
    },
  })

  return NextResponse.json(result)
})
