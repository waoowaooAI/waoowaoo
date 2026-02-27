import { NextRequest } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { TASK_TYPE } from '@/lib/task/types'
import { maybeSubmitLLMTask } from '@/lib/llm-observe/route-task'

function parseReferenceImages(body: Record<string, unknown>): string[] {
  const list = Array.isArray(body.referenceImageUrls)
    ? body.referenceImageUrls.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
    : []
  if (list.length > 0) return list.slice(0, 5)
  const single = typeof body.referenceImageUrl === 'string' ? body.referenceImageUrl.trim() : ''
  return single ? [single] : []
}

/**
 * 资产中心 - 参考图转角色（任务化）
 */
export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const referenceImages = parseReferenceImages(body)
  if (referenceImages.length === 0) {
    throw new ApiError('INVALID_PARAMS')
  }

  const isBackgroundJob = body.isBackgroundJob === true || body.isBackgroundJob === 1 || body.isBackgroundJob === '1'
  const characterId = typeof body.characterId === 'string' ? body.characterId : ''
  const appearanceId = typeof body.appearanceId === 'string' ? body.appearanceId : ''
  if (isBackgroundJob && (!characterId || !appearanceId)) {
    throw new ApiError('INVALID_PARAMS')
  }

  const asyncTaskResponse = await maybeSubmitLLMTask({
    request,
    userId: session.user.id,
    projectId: 'global-asset-hub',
    type: TASK_TYPE.ASSET_HUB_REFERENCE_TO_CHARACTER,
    targetType: appearanceId ? 'GlobalCharacterAppearance' : 'GlobalCharacter',
    targetId: appearanceId || characterId || session.user.id,
    routePath: '/api/asset-hub/reference-to-character',
    body,
    dedupeKey: `asset_hub_reference_to_character:${appearanceId || characterId || session.user.id}`})
  if (asyncTaskResponse) return asyncTaskResponse

  throw new ApiError('INVALID_PARAMS')
})
