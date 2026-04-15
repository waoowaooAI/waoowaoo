import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { selectAssetRender } from '@/lib/assets/services/asset-actions'

type LegacyProjectCharacterSelectBody = {
  characterId?: string
  appearanceId?: string
  selectedIndex?: number | null
}

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json() as LegacyProjectCharacterSelectBody
  if (typeof body.characterId !== 'string' || body.characterId.trim().length === 0) {
    throw new ApiError('INVALID_PARAMS')
  }

  const result = await selectAssetRender({
    kind: 'character',
    assetId: body.characterId,
    body: {
      appearanceId: body.appearanceId,
      imageIndex: body.selectedIndex,
    },
    access: {
      scope: 'project',
      userId: authResult.session.user.id,
      projectId,
    },
  })

  return NextResponse.json(result)
})
