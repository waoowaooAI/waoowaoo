import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { TASK_TYPE } from '@/lib/task/types'
import { maybeSubmitLLMTask } from '@/lib/llm-observe/route-task'

/**
 * 资产中心 - AI 修改场景描述（任务化）
 * POST /api/asset-hub/ai-modify-location
 * body: { locationId, imageIndex, currentDescription, modifyInstruction }
 */
export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const payload = await request.json()
  const { locationId, imageIndex, currentDescription, modifyInstruction } = payload ?? {}

  if (!locationId || imageIndex === undefined || !currentDescription || !modifyInstruction) {
    throw new ApiError('INVALID_PARAMS')
  }

  const location = await prisma.globalLocation.findUnique({
    where: { id: locationId },
    select: { id: true, userId: true, name: true }})
  if (!location || location.userId !== session.user.id) {
    throw new ApiError('NOT_FOUND')
  }

  const asyncTaskResponse = await maybeSubmitLLMTask({
    request,
    userId: session.user.id,
    projectId: 'global-asset-hub',
    type: TASK_TYPE.ASSET_HUB_AI_MODIFY_LOCATION,
    targetType: 'GlobalLocation',
    targetId: locationId,
    routePath: '/api/asset-hub/ai-modify-location',
    body: {
      locationId,
      locationName: location.name,
      imageIndex,
      currentDescription,
      modifyInstruction},
    dedupeKey: `asset_hub_ai_modify_location:${locationId}:${imageIndex}`})
  if (asyncTaskResponse) return asyncTaskResponse

  throw new ApiError('INVALID_PARAMS')
})
